import express from "express";
import session from "express-session";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import morgan from "morgan";
import methodOverride from "method-override";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(morgan("dev"));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-session-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    }
  })
);

// Helpers for file IO
const DATA_DIR = path.join(__dirname, "data");
const filePath = (name) => path.join(DATA_DIR, name);

async function readJSON(name) {
  const p = filePath(name);
  try {
    const raw = await readFile(p, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function writeJSON(name, data) {
  const p = filePath(name);
  await writeFile(p, JSON.stringify(data, null, 2), "utf-8");
}

// Auth helpers
function isLoggedIn(req) {
  return !!req.session.user;
}

function isAdmin(req) {
  return isLoggedIn(req) && req.session.user.role === "admin";
}

function requireAuth(req, res, next) {
  if (!isLoggedIn(req)) return res.redirect("/login");
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).send("Forbidden");
  next();
}

// Attach user to locals for templates
app.use(async (req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.get("/", async (req, res) => {
  const posts = await readJSON("blogs.json");
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render("index", { posts });
});

app.get("/login", (req, res) => {
  if (isLoggedIn(req)) return res.redirect("/");
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const admins = await readJSON("admins.json");
  const users = await readJSON("users.json");

  const admin = admins.find((a) => a.email === email);
  if (admin) {
    if (!admin.password_hash) {
      return res.status(400).send("Admin password not set. See README to set a hash.");
    }
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).render("login", { error: "Invalid credentials" });
    req.session.user = { email, name: admin.name || "Admin", role: "admin" };
    return res.redirect("/");
  }

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).render("login", { error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).render("login", { error: "Invalid credentials" });
  req.session.user = { email, name: user.name || email.split("@")[0], role: "user" };
  res.redirect("/");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/signup", (req, res) => {
  if (isLoggedIn(req)) return res.redirect("/");
  res.render("signup");
});

app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).render("signup", { error: "Email and password required" });
  const users = await readJSON("users.json");
  const admins = await readJSON("admins.json");
  if (admins.some((a) => a.email === email) || users.some((u) => u.email === email)) {

    return res.status(400).render("signup", { error: "Email already exists" });
  }
  const password_hash = await bcrypt.hash(password, 10);
  users.push({ name: name || "", email, password_hash, createdAt: new Date().toISOString() });
  await writeJSON("users.json", users);
  res.redirect("/login");
});

// Blog CRUD
app.get("/posts/new", requireAuth, (req, res) => {
  res.render("new-post");
});

app.post("/posts", requireAuth, async (req, res) => {
  const { title, content } = req.body;
  const posts = await readJSON("blogs.json");
  const post = {
    id: nanoid(10),
    title: title?.trim() || "(untitled)",
    content: content?.trim() || "",
    authorEmail: req.session.user.email,
    authorName: req.session.user.name,
    createdAt: new Date().toISOString(),
    likes: [],
    dislikes: []
  };
  posts.push(post);
  await writeJSON("blogs.json", posts);
  res.redirect("/");
});

app.delete("/posts/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const posts = await readJSON("blogs.json");
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).send("Post not found");
  const post = posts[idx];
  if (!isAdmin(req) && post.authorEmail !== req.session.user.email) {
    return res.status(403).send("You can only delete your own posts");
  }
  posts.splice(idx, 1);
  await writeJSON("blogs.json", posts);
  res.redirect("/");
});

// Like / Dislike with single action per user per post (toggle)
app.post("/posts/:id/like", requireAuth, async (req, res) => {
  const { id } = req.params;
  const posts = await readJSON("blogs.json");
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).send("Post not found");

  const u = req.session.user.email;
  post.dislikes = post.dislikes.filter((e) => e !== u);
  if (post.likes.includes(u)) {
    post.likes = post.likes.filter((e) => e !== u); // toggle off
  } else {
    post.likes.push(u);
  }

  await writeJSON("blogs.json", posts);
  res.redirect("/");
});

app.post("/posts/:id/dislike", requireAuth, async (req, res) => {
  const { id } = req.params;
  const posts = await readJSON("blogs.json");
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).send("Post not found");

  const u = req.session.user.email;
  post.likes = post.likes.filter((e) => e !== u);
  if (post.dislikes.includes(u)) {
    post.dislikes = post.dislikes.filter((e) => e !== u); // toggle off
  } else {
    post.dislikes.push(u);
  }

  await writeJSON("blogs.json", posts);
  res.redirect("/");
});

// Me / Session info (JSON)
app.get("/me", (req, res) => {
  res.json(req.session.user || null);
});

// 404
app.use((req, res) => {
  res.status(404).send("Not Found");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
