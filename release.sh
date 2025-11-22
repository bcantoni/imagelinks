#!/bin/bash

# Release script for ImageLinks
# Usage: ./release.sh <version>
# Example: ./release.sh 0.1.5

set -e

# Check if version argument is provided
if [ -z "$1" ]; then
  echo "Error: Version number required"
  echo "Usage: ./release.sh <version>"
  echo "Example: ./release.sh 0.1.5"
  exit 1
fi

VERSION=$1
TAG="v${VERSION}"

# Validate version format (x.y.z)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in x.y.z format (e.g., 0.1.5)"
  exit 1
fi

echo "Starting release process for version ${VERSION}..."
echo ""

# Step 1: Run npm run format
echo "Step 1: Formatting code..."
npm run format
echo ""

# Step 2: Check for unstaged files
echo "Step 2: Checking for unstaged changes..."
if ! git diff-index --quiet HEAD --; then
  echo "Error: You have unstaged changes in your working directory."
  echo "Please commit changed files then run again."
  git status
  exit 1
fi
echo "Working directory is clean."
echo ""

# Step 3: Check if tag already exists
echo "Step 3: Checking if tag ${TAG} already exists..."
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} already exists."
  echo "Please pick a newer version then run again."
  exit 1
fi
echo "Tag ${TAG} is available."
echo ""

# Step 4: Update package.json version
echo "Step 4: Updating package.json to version ${VERSION}..."
# Use sed to replace version in package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS sed requires empty string after -i
  sed -i '' "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
else
  # Linux sed
  sed -i "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json
fi
echo "package.json updated."
echo ""

# Step 5: Commit package.json
echo "Step 5: Committing package.json..."
git commit -m "${TAG} Release" package.json
echo "Committed."
echo ""

# Step 6: Create git tag
echo "Step 6: Creating tag ${TAG}..."
git tag "${TAG}" -a -m "Version ${VERSION}"
echo "Tag created."
echo ""

# Step 7: Final message
echo "=========================================="
echo "Release ${TAG} prepared successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  git push"
echo "  git push --tags"
echo ""
