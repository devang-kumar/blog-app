# Express Blog (File-based Auth & Storage)

A minimal, deployable blog using **Express + EJS + Sessions** with **file-based** storage.  
- **Admins** can delete any post.  
- **Users** can delete **only their own** posts.  
- **Like/Dislike:** Each logged-in user can like or dislike **at most once** per post (toggle behavior).  
- **No database**. Data is stored in JSON files under `data/`:
  - `admins.json`: admin accounts
  - `users.json`: user accounts
  - `blogs.json`: posts

## Quick Start

```bash
npm install
npm start
# open http://localhost:3000
```

> Set `SESSION_SECRET` env var in production.

## Default Admin

`data/admins.json` ships with one admin: `admin@example.com`.  
You must set a password hash for this admin before logging in.

Generate a hash using Node (in your terminal):

```bash
node -e "import('bcryptjs').then(async m=>{const h=await m.default.hash('yourpassword',10);console.log(h)})"
```

Copy the printed hash into `data/admins.json` as `password_hash` for the admin.

Alternatively, create more admins by adding entries like:
```json
[
  {
    "email": "admin@example.com",
    "password_hash": "$2a$10$......",
    "name": "Admin"
  }
]
```

## Features
- Email/password login via users or admins list
- User signup (users only)
- Create, list, delete posts
- Admin can delete any post; user only their own
- Like/Dislike with single action per user per post (toggle, and like clears dislike and vice versa)
- Simple, clean UI with EJS

## API/Routes

- `GET /` — list posts
- `GET /login` — login page
- `POST /login` — login handler
- `POST /logout` — logout
- `GET /signup` — user signup page
- `POST /signup` — create user
- `GET /posts/new` — new post page (auth required)
- `POST /posts` — create post (auth required)
- `DELETE /posts/:id` — delete post (author or admin)
- `POST /posts/:id/like` — like (auth required; toggles; ensures single action per user)
- `POST /posts/:id/dislike` — dislike (auth required; toggles; ensures single action per user)
- `GET /me` — current session JSON

## Deploy Notes

- Works on Node 18+.
- Use a persistent volume for the `data/` folder.
- Set `SESSION_SECRET` to a strong random string.
- For reverse proxies (Render, Railway, etc.), ensure the app listens on the port provided by the platform (uses `PORT` env).

## File Structure

```
express-blog-file-auth/
├─ server.js
├─ package.json
├─ public/
│  └─ styles.css
├─ views/
│  ├─ layout.ejs
│  ├─ index.ejs
│  ├─ login.ejs
│  ├─ signup.ejs
│  └─ new-post.ejs
└─ data/
   ├─ admins.json
   ├─ users.json
   └─ blogs.json
```

## Notes

- File-based storage is not safe for high concurrency. It's perfect for demos, small projects, or assignments.
- Likes/Dislikes store user emails in arrays inside each post:
  ```json
  {
    "likes": ["user1@example.com"],
    "dislikes": []
  }
  ```
- Deleting a user will not remove likes/dislikes automatically.
```
