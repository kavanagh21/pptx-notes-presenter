# PPTX Notes Presenter

A client-side web app that loads a PowerPoint (.pptx / .ppsx) file in the browser, extracts speaker notes, and displays them alongside a slide preview in a large, readable layout — ideal for presenting from an iPad or tablet.

**[Live demo on GitHub Pages](https://kavanagh21.github.io/pptx-notes-presenter/)**

## Features

- **Slide preview** — renders a scaled preview of the current slide using [@jvmr/pptx-to-html](https://www.npmjs.com/package/@jvmr/pptx-to-html)
- **Structured speaker notes** — preserves bullet points, indentation, and paragraph breaks from your PowerPoint notes
- **Bullet-by-bullet mode** — advance through notes one bullet at a time, with a "[Next slide]" indicator at the end
- **Dark mode** — toggle between light and dark themes (persisted in localStorage, respects system preference)
- **Full-screen presenter mode** — uses the Fullscreen API with automatic Screen Wake Lock so the display stays on
- **Adjustable layout** — resize the notes/preview split and adjust font size with sliders
- **Navigation** — keyboard (Arrow keys, Space, Page Up/Down), touch swipe, and a jump-to-slide input
- **Offline resume** — saves the last loaded deck's notes to IndexedDB so you can resume without re-uploading
- **100% client-side** — no server, no uploads; your files never leave the device
- **iPad / iOS friendly** — robust file reading with multiple fallback strategies for cloud storage providers (OneDrive, iCloud Drive)

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+

### Install and run locally

```bash
git clone https://github.com/kavanagh21/pptx-notes-presenter.git
cd pptx-notes-presenter
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173/pptx-notes-presenter/`).

### Build for production

```bash
npm run build
npm run preview   # serve the production build locally
```

The built output goes to `dist/` and is configured with `base: "/pptx-notes-presenter/"` for GitHub Pages deployment.

## Usage

1. Open the app and tap **Choose File** to select a `.pptx` or `.ppsx` file
2. The slide preview appears on the left, speaker notes on the right
3. Navigate with the **Prev / Next** buttons, arrow keys, or swipe left/right
4. Toggle **Bullet mode** to step through notes one point at a time
5. Adjust **Font** size and **Text width** sliders to suit your screen
6. Enter **Full screen** for a distraction-free presenter view (screen stays awake automatically)

### iPad tips

- If your file is stored in **OneDrive or iCloud Drive** and fails to load, save a local copy first: in the Files app, long-press the file → Copy → paste into "On My iPad", then select that copy
- The app works best when added to the Home Screen (Share → Add to Home Screen) for a more app-like experience

## Tech stack

| Concern | Library |
|---|---|
| UI framework | [React 19](https://react.dev/) |
| Bundler | [Vite 7](https://vite.dev/) |
| PPTX → HTML rendering | [@jvmr/pptx-to-html](https://www.npmjs.com/package/@jvmr/pptx-to-html) |
| ZIP / OOXML parsing | [JSZip](https://stuk.github.io/jszip/) + DOMParser |
| Persistence | IndexedDB (deck data), localStorage (preferences) |
| Screen Wake Lock | [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) |

## Project structure

```
src/
├── App.jsx              Main app component (layout, navigation, state)
├── App.css              All app styling (light/dark themes, responsive layout)
├── components/
│   ├── SlidePreview.jsx Renders scaled slide HTML from pptx-to-html
│   └── NotesPanel.jsx   Displays structured notes, bullet-by-bullet mode
├── hooks/
│   ├── useDarkMode.js   Dark/light theme toggle with localStorage
│   └── useFullscreen.js Fullscreen API + Screen Wake Lock
└── lib/
    ├── pptxNotes.js     Extracts speaker notes from PPTX via JSZip + XML
    ├── readFile.js      Robust file reading with iOS/cloud storage fallbacks
    └── storage.js       IndexedDB persistence for deck data
```

## License

MIT
