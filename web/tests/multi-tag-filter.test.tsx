import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tag } from "@/components/MemoContent/Tag";
import TagsSection from "@/components/MemoExplorer/TagsSection";
import MemoFilters from "@/components/MemoFilters";
import TagTree from "@/components/TagTree";
import { MemoFilterProvider, useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useMemoFilters } from "@/hooks/useMemoFilters";

const memoViewMock = vi.hoisted(() => ({ parentPage: "/" }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ shortcuts: [] }),
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ tagsSetting: { tags: {} } }),
}));

vi.mock("@/components/MemoView/MemoViewContext", () => ({
  useMemoViewContext: () => ({ parentPage: memoViewMock.parentPage }),
}));

vi.mock("@/hooks", () => ({
  useLocalStorage: <T,>(_key: string, defaultValue: T) => [defaultValue, vi.fn()],
}));

vi.mock("@/utils/i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/i18n")>()),
  useTranslate: () => (key: string) => (key === "ui.remove-filter" ? "Remove filter" : key),
}));

const FilterProbe = () => {
  const { filters } = useMemoFilterContext();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const apiFilter = useMemoFilters();
  const tagValues = filters.filter((filter) => filter.factor === "tagSearch").map((filter) => filter.value);

  return (
    <>
      <output data-testid="tag-filters">{tagValues.join("|")}</output>
      <output data-testid="pathname">{location.pathname}</output>
      <output data-testid="url-filter">{searchParams.get("filter") || ""}</output>
      <output data-testid="api-filter">{apiFilter || ""}</output>
    </>
  );
};

const renderWithFilters = (children: React.ReactNode, initialEntry = "/?filter=tagSearch:work") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MemoFilterProvider>
        {children}
        <FilterProbe />
      </MemoFilterProvider>
    </MemoryRouter>,
  );

const expectWorkAndUrgent = async () => {
  await waitFor(() => {
    expect(screen.getByTestId("tag-filters")).toHaveTextContent("work|urgent");
    expect(screen.getByTestId("url-filter")).toHaveTextContent("tagSearch:work,tagSearch:urgent");
    expect(screen.getByTestId("api-filter")).toHaveTextContent('tag in ["work"] && tag in ["urgent"]');
  });
};

const HistoryControls = () => {
  const navigate = useNavigate();

  return (
    <>
      <button type="button" onClick={() => navigate("/?filter=tagSearch:work,tagSearch:urgent")}>
        Add history entry
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Forward
      </button>
    </>
  );
};

const DetailNavigationProbe = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { removeFilter } = useMemoFilterContext();
  const previousPathname = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousPathnameValue = previousPathname.current;
    if (previousPathnameValue !== undefined && previousPathnameValue !== location.pathname && !searchParams.has("filter")) {
      removeFilter(() => true);
    }
    previousPathname.current = location.pathname;
  }, [location.pathname, removeFilter, searchParams]);

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/memos/123", { state: { from: "/?filter=tagSearch:urgent" } })}
      >
        Open detail
      </button>
      <output data-testid="location-state-from">{(location.state as { from?: string } | null)?.from || ""}</output>
    </>
  );
};

describe("multi-tag filtering", () => {
  beforeEach(() => {
    memoViewMock.parentPage = "/";
  });

  it("restores multiple tag filters from a copied URL and builds AND semantics", async () => {
    renderWithFilters(null, "/?filter=tagSearch:work,tagSearch:urgent");

    await expectWorkAndUrgent();
  });

  it("keeps filter context in sync with browser back and forward navigation", async () => {
    renderWithFilters(<HistoryControls />);

    fireEvent.click(screen.getByRole("button", { name: "Add history entry" }));
    await expectWorkAndUrgent();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByTestId("tag-filters")).toHaveTextContent("work"));
    expect(screen.getByTestId("tag-filters")).not.toHaveTextContent("urgent");

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    await expectWorkAndUrgent();
  });

  it("preserves the parent filter URL when route-level cleanup syncs the detail URL", async () => {
    renderWithFilters(<DetailNavigationProbe />, "/?filter=tagSearch:urgent");

    fireEvent.click(screen.getByRole("button", { name: "Open detail" }));

    await waitFor(() => {
      expect(screen.getByTestId("pathname")).toHaveTextContent("/memos/123");
      expect(screen.getByTestId("url-filter")).toBeEmptyDOMElement();
      expect(screen.getByTestId("location-state-from")).toHaveTextContent("/?filter=tagSearch:urgent");
    });
  });

  it("keeps existing filters when selecting tags from the tag tree and toggles only the clicked tag", async () => {
    renderWithFilters(
      <TagTree
        tagAmounts={[
          ["work", 1],
          ["urgent", 1],
        ]}
        expandSubTags={false}
      />,
    );

    fireEvent.click(screen.getByText("urgent"));
    await expectWorkAndUrgent();

    fireEvent.click(screen.getByText("work"));
    await waitFor(() => expect(screen.getByTestId("tag-filters")).toHaveTextContent("urgent"));
    expect(screen.getByTestId("tag-filters")).not.toHaveTextContent("work");
  });

  it("keeps existing filters when selecting tags from the memo explorer", async () => {
    renderWithFilters(<TagsSection tagCount={{ work: 1, urgent: 1 }} />);

    fireEvent.click(screen.getByText("urgent"));

    await expectWorkAndUrgent();
  });

  it("keeps existing filters when selecting a tag rendered in memo content", async () => {
    renderWithFilters(<Tag data-tag="urgent">urgent</Tag>);

    fireEvent.click(screen.getByText("urgent"));

    await expectWorkAndUrgent();
  });

  it("keeps existing filters when a memo detail tag navigates back to the list", async () => {
    memoViewMock.parentPage = "/?filter=contentSearch:quarterly,tagSearch:work";
    renderWithFilters(<Tag data-tag="urgent">urgent</Tag>, "/memos/123");

    fireEvent.click(screen.getByText("urgent"));

    await waitFor(() => {
      expect(screen.getByTestId("tag-filters")).toHaveTextContent("work|urgent");
      expect(screen.getByTestId("pathname")).toHaveTextContent("/");
      expect(screen.getByTestId("url-filter")).toHaveTextContent("contentSearch:quarterly,tagSearch:work,tagSearch:urgent");
      expect(screen.getByTestId("api-filter")).toHaveTextContent('content.contains("quarterly") && tag in ["work"] && tag in ["urgent"]');
    });
  });

  it("renders one removable chip per selected tag without clearing the other", async () => {
    renderWithFilters(<MemoFilters />, "/?filter=tagSearch:work,tagSearch:urgent");

    await waitFor(() => {
      expect(screen.getByText("work")).toBeInTheDocument();
      expect(screen.getByText("urgent")).toBeInTheDocument();
    });

    const workChip = screen.getByText("work").parentElement;
    expect(workChip).not.toBeNull();
    fireEvent.click(within(workChip!).getByRole("button", { name: "Remove filter" }));

    await waitFor(() => expect(screen.getByTestId("tag-filters")).toHaveTextContent("urgent"));
    expect(screen.queryByText("work")).not.toBeInTheDocument();
  });
});
