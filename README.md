# Zendra Terminal Dashboard

This project is an EVM dashboard prototype with signup/login, wallet tracking, AVE + 0x API proxying, and a dashboard UI.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the backend server:
   ```bash
   npm run backend
   ```

3. Start the frontend development server:
   ```bash
   npm run dev
   ```

4. Open the browser at the Vite URL printed in the terminal.

> The frontend expects the backend to run at `http://127.0.0.1:3001`.

## Create a Git repo and publish to GitHub

Run these commands from the project root:

```bash
cd c:/Users/User2/Desktop/Ave.ai-html/zendra-terminal
git init
git add .
git commit -m "Initial commit"
```

Then create a repository on GitHub and link it:

```bash
git remote add origin https://github.com/0xOnye04/Zendra.git
git branch -M main
git push -u origin main
```

## Get a public GitHub link

Once pushed, your code URL will be:

```text
https://github.com/0xOnye04/Zendra
```

## Publish the website

### Option 1: GitHub Pages

This project has a backend, so GitHub Pages alone cannot host the full app. GitHub Pages can only serve the frontend static files, not the backend API.

If you want only the frontend on GitHub Pages:

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Configure GitHub Pages in repository settings to use the `main` branch and `root` or `gh-pages` branch.

Your site URL will be:

```text
https://<your-username>.github.io/<repo-name>/
```

### Option 2: Vercel / Netlify (recommended for full app)

Use Vercel or Netlify to deploy both frontend and backend properly.

- Connect your GitHub repo.
- Add environment variables for the backend if needed.
- Set the frontend build command to `npm run build` and publish directory to `dist`.

## Notes

- The login/signup system is currently stored in `backend/users.json`.
- The backend is set to run on `http://127.0.0.1:3001`.
- To make the site public, you will need a GitHub repo and a hosted backend service.

## Next step

If you want, I can also initialize the Git repository for you inside this project and add a remote URL template.
