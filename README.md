# Priyanshu Kumar – Personal Portfolio

A simple, responsive personal portfolio built with HTML, CSS and JavaScript, hosted on GitHub Pages.

**Live site:** https://priyanshu8586.github.io/Portfolio/

## Project status

| Part | Status |
|------|--------|
| Public website (home, about, skills, projects, contact form UI) | Built |
| Contact form backend (Supabase) | Built |
| Admin dashboard | Built |
| Google Drive backup | Built |

Until the backend is set up, the contact form will show "The contact form is not configured yet." This is expected.

## Files in this project

```
index.html            main page
style.css             styles          (or css/style.css)
main.js               page behaviour  (or js/main.js)
supabase-client.js    public Supabase settings (or js/supabase-client.js)
README.md             this file
.gitignore            files Git should ignore
assets/images/        put your profile photo here
```

### Important: file locations must match `index.html`

`index.html` has two lines that tell the browser where to find the CSS and JS files. They must match where you actually uploaded the files.

**If your files are all in the top level of the repo (flat layout):**

```html
<link rel="stylesheet" href="style.css" />
<script type="module" src="main.js"></script>
```

**If you created folders `css/` and `js/`:**

```html
<link rel="stylesheet" href="css/style.css" />
<script type="module" src="js/main.js"></script>
```

`main.js` and `supabase-client.js` must always stay in the same folder as each other.

## Publish on GitHub Pages (from an Android phone)

1. Open your repository on github.com in Chrome (use "Desktop site" if needed).
2. Make sure `index.html` is at the top level of the repo (not inside another folder).
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/ (root)**, then tap **Save**.
6. Wait 1–2 minutes, then open `https://priyanshu8586.github.io/Portfolio/`.

## Upload and edit files on Android

**Upload files**
1. Open the repo, tap **Add file → Upload files**.
2. Choose your files, then tap **Commit changes**.
3. Note: uploading from a phone usually does not keep folders. To create a folder, use **Add file → Create new file** and type the name with a slash, for example `css/style.css`, then paste the content.

**Edit a file**
1. Open the file in the repo and tap the **pencil** icon.
2. Make your change and tap **Commit changes**.
3. Wait about a minute and refresh the site (clear the page cache if you do not see the change).

## What to edit first

- **Profile photo:** upload `profile.jpg` to `assets/images/`, then in `index.html` replace the `avatar-placeholder` block with
  `<img src="assets/images/profile.jpg" alt="Photo of Priyanshu Kumar" />`.
- **About text:** edit the paragraphs in the `About` section of `index.html`.
- **Projects:** copy a `<article class="card project reveal">` block for each project, then change the title, description, technologies and links. Remove `data-placeholder` and `aria-disabled="true"` from a link once it has a real URL.
- **GitHub and LinkedIn links:** in the footer of `index.html`, put your real URLs and remove `data-placeholder` and `aria-disabled="true"`.

Only write things that are true. Do not add jobs, awards or clients you do not have.

## Contact form (backend coming later)

The form needs a Supabase project. When the backend stages are done, you will:

1. Open `supabase-client.js` and replace the two placeholders with your **Project URL** and **publishable key** (Supabase → Project Settings → API).
2. Deploy the backend functions to Supabase (separate from GitHub Pages).

## Security rules (very important)

- This repository is **public**. Anything you upload can be seen by anyone.
- Only the Supabase **Project URL** and **publishable key** may be put in the website files.
- **Never** upload a Supabase service-role or secret key, a Google client secret, passwords, tokens, or exported contact lists (CSV files).
- Do not put your phone number or home address on the site.
- If you accidentally upload a secret, delete it **and** create a new key in the service where it came from. Deleting the file alone is not enough.

## Troubleshooting

| Problem | Likely fix |
|---------|-----------|
| 404 page | Pages not enabled, or `index.html` not at repo root. Wait 1–2 minutes after enabling. |
| Page has no styling | `style.css` path in `index.html` does not match where the file is. |
| Buttons and menu do nothing | `main.js` path in `index.html` is wrong, or `supabase-client.js` is not next to `main.js`. |
| Change not showing | Wait a minute, then refresh or reopen the tab. |
| "Contact form is not configured" | Expected until Supabase is set up. |

## License

Personal project. All rights reserved by Priyanshu Kumar.
