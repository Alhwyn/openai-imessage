#!/usr/bin/env bash
# Block reading/writing secrets in .env*; allow read-only access to .env.example.
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // .event // empty')
command=$(echo "$input" | jq -r '.command // empty')
file_path=$(echo "$input" | jq -r '
  .file_path // .path // .filePath //
  .tool_input.file_path // .tool_input.path //
  .tool_input.target_notebook // .updated_input.file_path //
  empty
')

deny() {
  local msg="$1"
  jq -n \
    --arg msg "$msg" \
    '{
      permission: "deny",
      user_message: $msg,
      agent_message: $msg
    }'
  exit 0
}

allow() {
  echo '{ "permission": "allow" }'
  exit 0
}

# True for .env and variants (.env.local, .env.production, …) but not .env.example
is_secret_env() {
  local p="$1"
  local base
  base=$(basename "$p")
  [[ "$base" == ".env" ]] && return 0
  [[ "$base" == .env.* && "$base" != ".env.example" ]] && return 0
  return 1
}

is_env_example() {
  local p="$1"
  [[ "$(basename "$p")" == ".env.example" ]]
}

# Shell: block redirects/edits that target .env or .env.example
if [[ -n "$command" ]]; then
  if echo "$command" | grep -Eq '(^|[^[:alnum:]_.-])\.env\.example([^[:alnum:]_.-]|$)'; then
    if echo "$command" | grep -Eqi '(>|>>|tee|sed|awk|perl|python|node|bun|echo|printf|cat\s*>|mv|cp|rm|truncate|ed\s|vim|nano|code\s)'; then
      deny "Do not modify .env.example. Read it only; leave the template unchanged."
    fi
  fi
  if echo "$command" | grep -Eq '(^|[^[:alnum:]_.-])\.env([^[:alnum:]_.]|$)'; then
    # Allow read-only inspection of .env.example already handled above;
    # any .env / .env.* (non-example) reference in a mutating shell context is denied.
    if echo "$command" | grep -Eqi '(>|>>|tee|sed|awk|perl|python|node|bun|echo|printf|cat\s*>|mv|cp|rm|truncate|touch|ed\s|vim|nano|code\s|export\s+.*=)'; then
      deny "Do not read or modify .env (or .env.* secret files). Use .env.example as the read-only template only."
    fi
    # Also block cat/less/head of secret .env files
    if echo "$command" | grep -Eqi '(^|[;&|]\s*)(cat|less|more|head|tail|bat|rg|grep|type|source|\.)\s+.*\.env([^.[:alnum:]_]|$)'; then
      deny "Do not read .env. Use .env.example for variable names only."
    fi
  fi
fi

if [[ -z "$file_path" ]]; then
  allow
fi

# Writes / edits: never touch .env* secrets or .env.example
case "$event" in
  preToolUse|afterFileEdit|afterTabFileEdit|"")
    if is_secret_env "$file_path"; then
      deny "Do not create, edit, or delete .env (or .env.* secret files). Never write secrets into the repo. Read .env.example only."
    fi
    if is_env_example "$file_path"; then
      # Deny writes to .env.example; reads are handled by beforeReadFile and allowed
      if [[ "$event" == "preToolUse" || "$event" == "afterFileEdit" || "$event" == "afterTabFileEdit" ]]; then
        deny "Do not modify .env.example. Read it only; leave the template unchanged."
      fi
    fi
    ;;
esac

# Reads: block secret .env files; allow .env.example
case "$event" in
  beforeReadFile|beforeTabFileRead|"")
    if is_secret_env "$file_path"; then
      deny "Do not read .env. Use .env.example for the list of required variable names only."
    fi
    ;;
esac

allow
