#!/usr/bin/env bash
set -Eeuo pipefail

# Safe publish gate for the protected main branch.
# It runs the development checks, refuses dirty worktrees and force pushes,
# and requires an explicit confirmation before updating origin/main.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOTE="${PUBLISH_REMOTE:-origin}"
BRANCH="${PUBLISH_BRANCH:-main}"
CONFIRM_TOKEN="PUBLISH_MAIN"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

info() {
  printf '[publish-main] %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

require_command git
require_command pnpm

[ -d "$ROOT_DIR/.git" ] || fail "not a Git worktree: $ROOT_DIR"
[ "$(git symbolic-ref --short HEAD 2>/dev/null || true)" = "$BRANCH" ] || fail "current branch must be $BRANCH"

git remote get-url "$REMOTE" >/dev/null 2>&1 || fail "remote not found: $REMOTE"

if [ -n "$(git status --porcelain)" ]; then
  git status --short
  fail "worktree is not clean; commit or stash changes before publishing"
fi

info "running TypeScript check"
pnpm check

info "running development test suite"
pnpm test -- --reporter=dot

info "fetching latest $REMOTE/$BRANCH"
git fetch --prune "$REMOTE" "$BRANCH"

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "$REMOTE/$BRANCH")"
BASE_HEAD="$(git merge-base HEAD "$REMOTE/$BRANCH")"

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
  info "main is already up to date; nothing to publish"
  exit 0
fi

if [ "$BASE_HEAD" != "$REMOTE_HEAD" ]; then
  fail "$REMOTE/$BRANCH contains commits not in local $BRANCH; rebase or merge explicitly, then rerun"
fi

AHEAD_COUNT="$(git rev-list --count "$REMOTE/$BRANCH"..HEAD)"
info "local main is ahead of $REMOTE/$BRANCH by $AHEAD_COUNT commit(s)"
printf '\nAbout to push %s to %s/%s.\n' "$LOCAL_HEAD" "$REMOTE" "$BRANCH"
printf 'Type %s to continue: ' "$CONFIRM_TOKEN"
read -r confirmation
[ "$confirmation" = "$CONFIRM_TOKEN" ] || fail "publish cancelled"

# Deliberately do not use --force or --force-with-lease.
git push "$REMOTE" "$BRANCH"

PUBLISHED_HEAD="$(git ls-remote --heads "$REMOTE" "$BRANCH" | awk '{print $1}')"
[ "$PUBLISHED_HEAD" = "$LOCAL_HEAD" ] || fail "remote verification failed after push"

info "published $LOCAL_HEAD to $REMOTE/$BRANCH"
