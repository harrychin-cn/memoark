#ifndef MyAppVersion
  #error MyAppVersion is required
#endif
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif
#ifndef NumericVersion
  #error NumericVersion is required
#endif

#define MyAppName "MemoArk"
#define MyAppPublisher "MemoArk Contributors"
#define MyAppURL "https://github.com/harrychin-cn/memoark"
#define MyAppExeName "MemoArk.exe"

[Setup]
AppId={{81F34E30-6B14-4E79-9AFE-BBA4F8D3FC36}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\MemoArk
DefaultGroupName=MemoArk
AllowNoIcons=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir={#OutputDir}
OutputBaseFilename=MemoArk-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile={#SourceDir}\memoark.ico
UninstallDisplayIcon={app}\MemoArk.exe
LicenseFile={#SourceDir}\LICENSE
VersionInfoVersion={#NumericVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=MemoArk local note-taking application installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#NumericVersion}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
RestartApplications=no
ChangesAssociations=no
ChangesEnvironment=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MemoArk"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\退出 MemoArk"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--shutdown"
Name: "{group}\卸载 MemoArk"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MemoArk"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure StopMemoArk();
var
  ResultCode: Integer;
  ExistingExe: String;
  WaitCount: Integer;
begin
  ExistingExe := ExpandConstant('{app}\MemoArk.exe');
  if FileExists(ExistingExe) then
  begin
    Exec(ExistingExe, '--shutdown', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    WaitCount := 0;
    while CheckForMutexes('Local\MemoArkDesktop') and (WaitCount < 100) do
    begin
      Sleep(100);
      WaitCount := WaitCount + 1;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopMemoArk();
  if CheckForMutexes('Local\MemoArkDesktop') then
    Result := 'MemoArk is still running. Use the Start menu shortcut "退出 MemoArk" and run setup again.'
  else
    Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    StopMemoArk();
end;
