#!/bin/bash
# Initialize Git repository and push to GitHub for 0xOnye04/Zendra
cd "$(dirname "$0")"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/0xOnye04/Zendra.git
git push -u origin main
echo "Repository initialized and pushed to https://github.com/0xOnye04/Zendra"
