; Hooks into Tauri's NSIS installer (bundle > windows > nsis > installerHooks in tauri.conf.json).
;
; Until 2.20.0 the app was installed as «РО Хелпер»: the folder, the entry in «Установленные приложения», the
; shortcuts and the autostart entry were named so. Windows keys all of them by the product's name, so the
; installer of «Кремлёвский Ассистент» would put a second copy beside the old one. After installing, it takes the
; old one's place instead: the same shortcuts and autostart under the new name, then the old copy uninstalled
; quietly. The settings, the sign-in and the downloaded laws stay: they live by the identifier
; (%APPDATA%\com.skyze.rohelper), not by the name, and a quiet uninstall never deletes them.

!define OLDPRODUCTNAME "РО Хелпер"
!define OLDUNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${OLDPRODUCTNAME}"
!define RUNKEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define STARTUPAPPROVEDKEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R5 HKCU "${OLDUNINSTKEY}" "UninstallString"
  ${If} $R5 != ""
    DetailPrint "Перенос с «${OLDPRODUCTNAME}»"

    ; Where the old copy is: written in quotes by its installer.
    ReadRegStr $R6 HKCU "${OLDUNINSTKEY}" "InstallLocation"
    StrCpy $0 $R6 1
    ${If} $0 == '"'
      StrCpy $R6 $R6 "" 1
      StrCpy $R6 $R6 -1
    ${EndIf}
    ${If} $R6 == ""
      StrCpy $R6 "$LOCALAPPDATA\${OLDPRODUCTNAME}"
    ${EndIf}

    ; An update skips the shortcuts (they are expected to exist under this name): make the ones the old copy had.
    ${IfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}
    ${If} ${FileExists} "$DESKTOP\${OLDPRODUCTNAME}.lnk"
    ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
      CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Started with Windows: the same entry for the new copy, written as the autostart plugin writes it.
    ReadRegStr $R7 HKCU "${RUNKEY}" "${OLDPRODUCTNAME}"
    ${If} $R7 != ""
      WriteRegStr HKCU "${RUNKEY}" "${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe --autostart"
    ${EndIf}

    ; The old copy, uninstalled quietly in its place (`_?=` makes it wait); its app data stays.
    ${If} $R6 != $INSTDIR
    ${AndIf} ${FileExists} "$R6\uninstall.exe"
      ExecWait '"$R6\uninstall.exe" /S _?=$R6' $0
      Delete "$R6\uninstall.exe"
      RMDir "$R6"
    ${EndIf}

    ; Whatever an uninstaller that is gone or failed left behind.
    Delete "$SMPROGRAMS\${OLDPRODUCTNAME}.lnk"
    Delete "$DESKTOP\${OLDPRODUCTNAME}.lnk"
    DeleteRegValue HKCU "${RUNKEY}" "${OLDPRODUCTNAME}"
    DeleteRegValue HKCU "${STARTUPAPPROVEDKEY}" "${OLDPRODUCTNAME}"
    DeleteRegKey HKCU "${OLDUNINSTKEY}"
    DeleteRegKey HKCU "Software\${MANUFACTURER}\${OLDPRODUCTNAME}"
  ${EndIf}
!macroend
