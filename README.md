# Cast Videos: Google Cast Chrome Sender SDK Demo App

This is a sample application demonstrating how to build a Google Cast Chrome Sender using TypeScript and modern web standards. It showcases how to load the Cast SDK, manage Cast sessions, and control media playback.

## Project Structure

- `index.html`: The main entry point for the application.
- `src/`: TypeScript source files.
  - `main.ts`: Entry point that initializes the application and the Cast SDK.
  - `CastPlayer.ts`: Main player logic and Cast SDK integration.
  - `constants.ts`: Constants used throughout the application.
- `dist/`: Compiled JavaScript output (ignored by Git).
- `css/`: Stylesheets for the application.
- `images/`, `imagefiles/`: Assets and icons used in the interface.

## Getting Started

### 1. Install Dependencies

Make sure you have [Node.js](https://nodejs.org/) installed. Then, install the required development dependencies:

```bash
npm install
```

### 2. Compile TypeScript

The project uses TypeScript which needs to be compiled to JavaScript before running.

To compile the TypeScript files once:

```bash
npx tsc
```

To automatically compile the TypeScript files whenever they change (Watch Mode):

```bash
npx tsc --watch
```

## Running the Application

Google Cast requires the sender application to be hosted on a web server.

You can use any local static HTTP server to serve the root directory. 

**Using `http-server` (via npx):**

```bash
npx http-server -p 8000
```
