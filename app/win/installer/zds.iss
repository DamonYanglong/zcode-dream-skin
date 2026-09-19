; zcode-dream-skin/app/win/installer/zds.iss
; Inno Setup 安装器定义（对齐 Codex Dream Skin 的分发形态）。
; 编译: ISCC.exe /DAppVersion=x.y.z /DStageRoot=<win路径> /DOutputDir=<win路径> zds.iss
; StageRoot 指向 build-win.sh 组装好的 staging 目录（含 engine/、runtime/、tray.ps1、
; install.ps1、app.ico、vendored languages/ 等）。安装逻辑复用 install.ps1（幂等：
; Src==Dest 时跳过复制，只做快捷方式/托盘启动），zip 路径与安装器路径共用一套。
; @author DamonYanglong
; @date 2026/09/19

#ifndef AppVersion
  #error AppVersion must be supplied via /DAppVersion
#endif
#ifndef StageRoot
  #error StageRoot must be supplied via /DStageRoot
#endif
#ifndef OutputDir
  #error OutputDir must be supplied via /DOutputDir
#endif

#define AppName "ZCode Dream Skin"
#define AppPublisher "ZCode Dream Skin contributors"
#define AppUrl "https://github.com/damon/zcode-dream-skin"
#define PowerShellPath "{sysnative}\WindowsPowerShell\v1.0\powershell.exe"

[Setup]
AppId={{7C4A1F5E-9B3D-4E6A-8F2C-1D5B0A9E4C77}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppUpdatesURL={#AppUrl}/releases
DefaultDirName={localappdata}\Programs\ZCodeDreamSkin
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputDir={#OutputDir}
OutputBaseFilename=ZCodeDreamSkin-Setup-v{#AppVersion}
SetupIconFile={#StageRoot}\app.ico
UninstallDisplayIcon={app}\app.ico
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#AppPublisher}
VersionInfoDescription={#AppName} installer
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}
CloseApplications=no
RestartApplications=no
RestartIfNeededByRun=no
MinVersion=10.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "{#StageRoot}\languages\ChineseSimplified.isl"

[Messages]
english.ConfirmUninstall=Uninstall will remove the Dream Skin runtime; saved themes stay in %%APPDATA%%\ZCodeDreamSkin.%n%nContinue?
chinesesimplified.ConfirmUninstall=卸载将移除 ZCode Dream Skin 运行时；已保存的主题保留在 %%APPDATA%%\ZCodeDreamSkin。%n%n是否继续？

[Files]
Source: "{#StageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ZCode Dream Skin"; Filename: "{app}\launch-tray.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{group}\ZCode Dream Skin 恢复官方外观"; Filename: "{app}\restore-official.vbs"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"

[Run]
; 复用 install.ps1（Src==Dest 跳过复制）：建快捷方式组内补充、确保 runtime、启动托盘
Filename: "{#PowerShellPath}"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\install.ps1"""; WorkingDir: "{app}"; Flags: runhidden nowait; Description: "{cm:LaunchProgram,{#AppName}}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ExitCode: Integer;
begin
  if CurUninstallStep <> usUninstall then
    exit;
  // 先停托盘再删文件（PowerShell 脚本来自 {app}，此刻尚未删除）
  Exec(ExpandConstant('{#PowerShellPath}'),
    '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}') + '\kill-tray.ps1"',
    ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode);
end;
