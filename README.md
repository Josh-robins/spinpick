# SpinPick – Decision Wheel

A customisable spinning wheel for making decisions: which group presents next, who gets the gift, where to eat.
Plain HTML, CSS and JavaScript. No build step, no backend, no accounts.

## Files

| File | What it does |
|------|--------------|
| `index.html` | Page structure |
| `style.css` | Look, themes, responsive layout |
| `app.js` | Wheel drawing, spin animation, sounds, sharing, saving |

## Host it free on GitHub Pages

1. Create a new repository on GitHub (e.g. `spinpick`) and upload all files to the root.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/spinpick/`.

## Features

- Add, rename, remove and weight options (weight 2 = double the chance)
- Quick fill "Group 1…N", paste a list, or import a `.txt` / `.csv` file
- Ready-made wheels: class groups, yes/no, dice, gift, where to eat, and more
- Animated spin that slows down, ticking sound, winner fanfare, confetti, result pop-up
- Remove the winner after each spin so nobody goes twice, plus Reset
- History of picks (a ready-made presentation order) that can be copied as a list
- Save your own wheels in the browser, with Undo for destructive actions
- Colour palettes, light/dark theme, spin length, sound and confetti switches
- Fullscreen projector mode, keyboard shortcut (Space), works on phones and desktops

## How sharing works

Press **Share** and the whole wheel (title, options, weights, settings) is compressed and packed into the link after the `#`.
Anyone opening the link sees the same wheel and spins it on their own device.
Nothing is uploaded to a server, so each person's spin is independent: the result is **not** synced live between devices.
(Live shared spinning would need a small backend such as Firebase or Supabase.)

Very long lists make long links. A few dozen options is fine.

## Customising the code

- Add templates in the `TEMPLATES` array in `app.js`.
- Add colour palettes in `PALETTES` in `app.js`.
- Colours and theme variables are at the top of `style.css`.
