//nolint:all
package cron

import (
	"io"
	"log"
	"reflect"
	"sync"
	"testing"
	"time"
)

func appendingJob(slice *[]int, value int) Job {
	var m sync.Mutex
	return FuncJob(func() {
		m.Lock()
		*slice = append(*slice, value)
		m.Unlock()
	})
}

func appendingWrapper(slice *[]int, value int) JobWrapper {
	return func(j Job) Job {
		return FuncJob(func() {
			appendingJob(slice, value).Run()
			j.Run()
		})
	}
}

func TestChain(t *testing.T) {
	var nums []int
	var (
		append1 = appendingWrapper(&nums, 1)
		append2 = appendingWrapper(&nums, 2)
		append3 = appendingWrapper(&nums, 3)
		append4 = appendingJob(&nums, 4)
	)
	NewChain(append1, append2, append3).Then(append4).Run()
	if !reflect.DeepEqual(nums, []int{1, 2, 3, 4}) {
		t.Error("unexpected order of calls:", nums)
	}
}

func TestChainRecover(t *testing.T) {
	panickingJob := FuncJob(func() {
		panic("panickingJob panics")
	})

	t.Run("panic exits job by default", func(*testing.T) {
		defer func() {
			if err := recover(); err == nil {
				t.Errorf("panic expected, but none received")
			}
		}()
		NewChain().Then(panickingJob).
			Run()
	})

	t.Run("Recovering JobWrapper recovers", func(*testing.T) {
		NewChain(Recover(PrintfLogger(log.New(io.Discard, "", 0)))).
			Then(panickingJob).
			Run()
	})

	t.Run("composed with the *IfStillRunning wrappers", func(*testing.T) {
		NewChain(Recover(PrintfLogger(log.New(io.Discard, "", 0)))).
			Then(panickingJob).
			Run()
	})
}

type countJob struct {
	m       sync.Mutex
	started int
	done    int
}

func (j *countJob) Run() {
	j.m.Lock()
	j.started++
	j.m.Unlock()
	j.m.Lock()
	j.done++
	j.m.Unlock()
}

func (j *countJob) Started() int {
	defer j.m.Unlock()
	j.m.Lock()
	return j.started
}

func (j *countJob) Done() int {
	defer j.m.Unlock()
	j.m.Lock()
	return j.done
}

type blockingCountJob struct {
	m           sync.Mutex
	started     int
	done        int
	startedCh   chan struct{}
	releaseCh   chan struct{}
	startedOnce sync.Once
	releaseOnce sync.Once
}

func newBlockingCountJob() *blockingCountJob {
	return &blockingCountJob{
		startedCh: make(chan struct{}),
		releaseCh: make(chan struct{}),
	}
}

func (j *blockingCountJob) Run() {
	j.m.Lock()
	j.started++
	j.m.Unlock()
	j.startedOnce.Do(func() { close(j.startedCh) })
	<-j.releaseCh
	j.m.Lock()
	j.done++
	j.m.Unlock()
}

func (j *blockingCountJob) Started() int {
	defer j.m.Unlock()
	j.m.Lock()
	return j.started
}

func (j *blockingCountJob) Done() int {
	defer j.m.Unlock()
	j.m.Lock()
	return j.done
}

func (j *blockingCountJob) Release() {
	j.releaseOnce.Do(func() { close(j.releaseCh) })
}

func (j *blockingCountJob) WaitStarted(t *testing.T) {
	t.Helper()
	select {
	case <-j.startedCh:
	case <-time.After(time.Second):
		t.Fatal("blocking job did not start")
	}
}

func runJobAsync(j Job) <-chan struct{} {
	finished := make(chan struct{})
	go func() {
		j.Run()
		close(finished)
	}()
	return finished
}

func waitForJobCompletions(t *testing.T, description string, completions ...<-chan struct{}) {
	t.Helper()
	var wg sync.WaitGroup
	wg.Add(len(completions))
	for _, completion := range completions {
		go func(completion <-chan struct{}) {
			defer wg.Done()
			<-completion
		}(completion)
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal(description)
	}
}

func TestChainDelayIfStillRunning(t *testing.T) {
	t.Run("runs immediately", func(*testing.T) {
		var j countJob
		wrappedJob := NewChain(DelayIfStillRunning(DiscardLogger)).Then(&j)
		wrappedJob.Run()
		if c := j.Done(); c != 1 {
			t.Errorf("expected job run once, immediately, got %d", c)
		}
	})

	t.Run("second run immediate if first done", func(*testing.T) {
		var j countJob
		wrappedJob := NewChain(DelayIfStillRunning(DiscardLogger)).Then(&j)
		wrappedJob.Run()
		wrappedJob.Run()
		if c := j.Done(); c != 2 {
			t.Errorf("expected job run twice, immediately, got %d", c)
		}
	})

	t.Run("second run delayed if first not done", func(*testing.T) {
		j := newBlockingCountJob()
		t.Cleanup(j.Release)
		wrappedJob := NewChain(DelayIfStillRunning(DiscardLogger)).Then(j)
		firstDone := runJobAsync(wrappedJob)
		j.WaitStarted(t)
		secondDone := runJobAsync(wrappedJob)
		started, done := j.Started(), j.Done()
		if started != 1 || done != 0 {
			t.Error("expected first job started, but not finished, got", started, done)
		}

		j.Release()
		waitForJobCompletions(t, "delayed jobs did not complete", firstDone, secondDone)
		started, done = j.Started(), j.Done()
		if started != 2 || done != 2 {
			t.Error("expected both jobs done, got", started, done)
		}
	})
}

func TestChainSkipIfStillRunning(t *testing.T) {
	t.Run("runs immediately", func(*testing.T) {
		var j countJob
		wrappedJob := NewChain(SkipIfStillRunning(DiscardLogger)).Then(&j)
		wrappedJob.Run()
		if c := j.Done(); c != 1 {
			t.Errorf("expected job run once, immediately, got %d", c)
		}
	})

	t.Run("second run immediate if first done", func(*testing.T) {
		var j countJob
		wrappedJob := NewChain(SkipIfStillRunning(DiscardLogger)).Then(&j)
		wrappedJob.Run()
		wrappedJob.Run()
		if c := j.Done(); c != 2 {
			t.Errorf("expected job run twice, immediately, got %d", c)
		}
	})

	t.Run("second run skipped if first not done", func(*testing.T) {
		j := newBlockingCountJob()
		t.Cleanup(j.Release)
		wrappedJob := NewChain(SkipIfStillRunning(DiscardLogger)).Then(j)
		firstDone := runJobAsync(wrappedJob)
		j.WaitStarted(t)
		secondDone := runJobAsync(wrappedJob)
		waitForJobCompletions(t, "second job was not skipped", secondDone)
		started, done := j.Started(), j.Done()
		if started != 1 || done != 0 {
			t.Error("expected first job started, but not finished, got", started, done)
		}

		j.Release()
		waitForJobCompletions(t, "first job did not complete", firstDone)
		started, done = j.Started(), j.Done()
		if started != 1 || done != 1 {
			t.Error("expected second job skipped, got", started, done)
		}
	})

	t.Run("skip 10 jobs on rapid fire", func(*testing.T) {
		j := newBlockingCountJob()
		t.Cleanup(j.Release)
		wrappedJob := NewChain(SkipIfStillRunning(DiscardLogger)).Then(j)
		firstDone := runJobAsync(wrappedJob)
		j.WaitStarted(t)
		completions := make([]<-chan struct{}, 0, 10)
		for i := 0; i < 10; i++ {
			completions = append(completions, runJobAsync(wrappedJob))
		}
		waitForJobCompletions(t, "rapid-fire jobs were not skipped", completions...)
		if started, done := j.Started(), j.Done(); started != 1 || done != 0 {
			t.Error("expected one blocked job and 10 dropped jobs, got", started, done)
		}
		j.Release()
		waitForJobCompletions(t, "first rapid-fire job did not complete", firstDone)
	})

	t.Run("different jobs independent", func(*testing.T) {
		j1 := newBlockingCountJob()
		j2 := newBlockingCountJob()
		t.Cleanup(j1.Release)
		t.Cleanup(j2.Release)
		chain := NewChain(SkipIfStillRunning(DiscardLogger))
		wrappedJob1 := chain.Then(j1)
		wrappedJob2 := chain.Then(j2)
		firstDone1 := runJobAsync(wrappedJob1)
		firstDone2 := runJobAsync(wrappedJob2)
		j1.WaitStarted(t)
		j2.WaitStarted(t)
		completions := make([]<-chan struct{}, 0, 20)
		for i := 0; i < 10; i++ {
			completions = append(completions, runJobAsync(wrappedJob1), runJobAsync(wrappedJob2))
		}
		waitForJobCompletions(t, "overlapping jobs were not skipped", completions...)
		if started1, done1 := j1.Started(), j1.Done(); started1 != 1 || done1 != 0 {
			t.Error("expected first job to remain blocked, got", started1, done1)
		}
		if started2, done2 := j2.Started(), j2.Done(); started2 != 1 || done2 != 0 {
			t.Error("expected second job to remain blocked, got", started2, done2)
		}
		j1.Release()
		j2.Release()
		waitForJobCompletions(t, "independent jobs did not complete", firstDone1, firstDone2)
	})
}
