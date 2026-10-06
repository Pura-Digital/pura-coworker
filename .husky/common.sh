# Git GUI clients (Cursor, Xcode, SourceTree) often omit nvm/fnm/homebrew from PATH.
if ! command -v node >/dev/null 2>&1; then
  export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
  fi
  if [ -d "$HOME/.fnm" ]; then
    export PATH="$HOME/.fnm/current/bin:$PATH"
  fi
fi
