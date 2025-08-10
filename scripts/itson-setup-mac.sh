# Homebrew
if command -v brew &> /dev/null; then
	echo "Disabling Brew analytics…"
	brew analytics off
else
	echo "Homebrew is not installed or not in PATH. Skipping analytics disable."
fi

# Input
echo "Setting Mac input preferences…"
sudo defaults write -g com.apple.trackpad.scaling 3
sudo defaults write -g com.apple.mouse.scaling 2.5 # 3 nicer?
sudo defaults write -g ApplePressAndHoldEnabled -bool false
sudo defaults write -g InitialKeyRepeat -int 10   # normal minimum is 15 (225 ms)
sudo defaults write -g KeyRepeat -int 1           # normal minimum is 2 (30 ms)
sudo defaults write -g AppleKeyboardUIMode -int 3 # Full keyboard access
sudo defaults write -g NSAutomaticCapitalizationEnabled -bool false
sudo defaults write -g NSAutomaticTextCompletionEnabled -bool false

# UI / UX
echo "Setting Mac UI/UX preferences…"
sudo defaults write -g AppleShowAllExtensions -bool true
sudo defaults write -g AppleShowScrollBars -string "Always"
# sudo defaults write -g com.apple.swipescrolldirection -bool false
sudo defaults write -g NSAutomaticWindowAnimationsEnabled -bool false
sudo defaults write -g NSInitialToolTipDelay -integer 1000
sudo defaults write -g NSNavPanelExpandedStateForSaveMode -bool true
sudo defaults write -g NSScrollAnimationEnabled -bool false
sudo defaults write -g NSToolbarTitleViewRolloverDelay -float 0
sudo defaults write -g NSWindowResizeTime -float 0.001 # 0 doesn't work
sudo defaults write com.apple.dock mru-spaces -bool false
sudo defaults write com.apple.dock show-recents -bool false
sudo defaults write com.apple.dock showhidden -bool true # make hidden items translucent
sudo defaults write com.apple.finder AnimateInfoPanes -bool false
sudo defaults write com.apple.finder AnimateWindowZoom -bool false
sudo defaults write com.apple.Finder AppleShowAllFiles -bool true
sudo defaults write com.apple.finder CreateDesktop -bool true # show icons on desktop
sudo defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
sudo defaults write com.apple.finder FXPreferredViewStyle Nlsv
sudo defaults write com.apple.finder QLEnableTextSelection -bool TRUE
sudo defaults write com.apple.finder QLInlinePreviewMinimumSupportedSize -int 512
sudo defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool False
sudo defaults write com.apple.finder ShowMountedServersOnDesktop -bool true
sudo defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool true
sudo defaults write com.apple.WindowManager EnableStandardClickToShowDesktop -int 0 # sonoma, don't click to show desktop
sudo chflags nohidden "$HOME/Library"
sudo chflags nohidden /Volumes
sudo defaults write com.apple.universalaccess buttonShapesEnabled -bool true
sudo defaults write com.apple.universalaccess reduceTransparency -bool true
sudo defaults write com.apple.universalaccess showWindowTitlebarIcons -bool true

# System
# sudo defaults write com.apple.desktopservices DSDontWriteUSBStores -bool true
sudo defaults write -g NSDisableAutomaticTermination -bool true
sudo defaults write -g NSDocumentSaveNewDocumentsToCloud -bool false
sudo defaults write -g WebKitDeveloperExtras -bool true
sudo defaults write com.apple.ActivityMonitor UpdatePeriod -int 1
sudo defaults write com.apple.CrashReporter DialogType -string 'developer'
sudo defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
sudo defaults write com.apple.finder FXDefaultSearchScope -string "SCcf"
sudo defaults write com.apple.finder ShowPathbar -bool true
sudo defaults write com.apple.finder ShowStatusBar -bool true
sudo defaults write com.apple.LaunchServices LSQuarantine -bool false
sudo defaults write com.apple.screencapture location -string "$HOME/"
sudo defaults write com.apple.screencapture type -string "png"
sudo defaults write com.apple.TimeMachine DoNotOfferNewDisksForBackup -bool true
echo "Setting Mac System preferences…"
sudo killall Dock
sudo killall Finder

# Terminal
echo "Setting Mac Terminal preferences, including default theme…"
sudo defaults write com.apple.terminal StringEncodings -array 4 # UTF-8 Encoding
sudo defaults write com.apple.Terminal ShowLineMarks -int 0
sudo defaults write com.apple.Terminal ShellExitAction 1

if [ "$TERM_PROGRAM" = "Apple_Terminal" ]; then
	echo "Skipping restarting Terminal.app since this script's in progress. Relaunch Terminal.app manually to apply changes."
else
	sudo killall Terminal
fi

# Safari
echo "Setting Safari preferences… Safari will close."
sudo killall Safari
sudo defaults write com.apple.Safari SendDoNotTrackHTTPHeader -bool true
sudo defaults write com.apple.Safari FindOnPageMatchesWordStartsOnly -bool false
sudo defaults write com.apple.Safari IncludeInternalDebugMenu -bool true
sudo defaults write com.apple.Safari IncludeDevelopMenu -bool true
# sudo defaults write com.apple.safari ShowFullURLInSmartSearchField -bool true # broken sonoma
# defaults write com.apple.Safari WebKitDeveloperExtrasEnabledPreferenceKey -bool true
# defaults write com.apple.Safari com.apple.Safari.ContentPageGroupIdentifier.WebKit2DeveloperExtrasEnabled -bool true

# TextEdit
echo "Setting TextEdit preferences… TextEdit will close."
sudo killall TextEdit
sudo defaults write com.apple.TextEdit RichText -int 0
sudo defaults write com.apple.TextEdit PlainTextEncoding -int 4
sudo defaults write com.apple.TextEdit PlainTextEncodingForWrite -int 4
sudo defaults write com.apple.TextEdit NSShowAppCentricOpenPanelInsteadOfUntitledFile -bool false

# Disk Utility
echo "Setting Disk Utility preferences… DiskUtility will close."
sudo killall DiskUtility
sudo defaults write com.apple.DiskUtility DUDebugMenuEnabled -bool true
sudo defaults write com.apple.DiskUtility advanced-image-options -bool true

echo "Disabling all sleep, hibernation, and enabling wake-on-network…"

# Disable system, display, and disk sleep on AC
sudo pmset -c sleep 0
sudo pmset -c displaysleep 0
sudo pmset -c disksleep 0

# Disable system, display, and disk sleep on battery (has no effect on desktops)
sudo pmset -b sleep 0
sudo pmset -b displaysleep 0
sudo pmset -b disksleep 0

# Disable standby and hibernation universally
sudo pmset -a standby 0
sudo pmset -a hibernatemode 0
sudo rm -f /var/vm/sleepimage

# Enable auto-restart on power loss
sudo pmset -a autorestart 1

# Enable Wake-on-LAN (WOMP)
sudo pmset -a womp 1

# Disable power nap (safer across laptops and desktops)
sudo pmset -a powernap 0

# Prevent sleep on power button press
sudo pmset -a powerbutton 0

# TODO broken...
# System-level override via systemsetup
# sudo systemsetup -setcomputersleep Never
# sudo systemsetup -setdisplaysleep Never
# sudo systemsetup -setharddisksleep Never
# sudo systemsetup -setwakeonnetworkaccess on

# Disable screensaver and password prompts
defaults -currentHost write com.apple.screensaver idleTime 0
defaults write com.apple.screensaver askForPassword -int 0
defaults write com.apple.screensaver askForPasswordDelay -int 0

echo "Done. System sleep and hibernation disabled. Wake-on-network enabled."
