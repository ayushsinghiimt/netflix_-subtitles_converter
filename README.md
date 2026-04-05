# Netflix Subtitle Translator 🎬

A Chrome extension that translates Netflix subtitles into Hindi (and 20+ other languages) in real time — so you can watch in original audio without missing a word.

## How It Works

1. **Intercepts** subtitle streams at the network layer (fetch + XHR)
2. **Batch translates** text via Google Translate API (minimizing API calls)
3. **Re-renders** translated subtitles into the Netflix player DOM in real time — no lag

## Setup

### 1. Get a Google Translate API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Cloud Translation API**:
   - Navigate to **APIs & Services → Library**
   - Search for **"Cloud Translation API"**
   - Click **Enable**
4. Create an API key:
   - Navigate to **APIs & Services → Credentials**
   - Click **+ CREATE CREDENTIALS → API key**
   - Copy the generated key
5. *(Recommended)* Restrict the key:
   - Click on the key → **API restrictions → Restrict key**
   - Select **Cloud Translation API** only
   - Under **Application restrictions**, add `https://www.netflix.com/*`

### 2. Configure the Extension

1. Clone this repo:
   ```bash
   git clone https://github.com/ayushsinghiimt/netflix_-subtitles_converter.git
   cd netflix_-subtitles_converter
   ```

2. Create your config file:
   ```bash
   cp config.example.js config.js
   ```

3. Open `config.js` and paste your API key:
   ```js
   const CONFIG = {
       GOOGLE_API_KEY: "paste-your-key-here"
   };
   ```

### 3. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the project folder

### 4. Use It

1. Go to [netflix.com](https://www.netflix.com/) and play any show
2. Click the extension icon in the toolbar
3. Toggle **Enable Translation** on
4. Select your target language
5. Reload the Netflix tab when prompted

## Supported Languages

### 🇮🇳 Indian Languages
Hindi, Bengali, Telugu, Marathi, Tamil, Urdu, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Sindhi, Nepali

### 🌍 International
English, Spanish, French, German, Japanese, Korean, Chinese, Arabic

## Project Structure

```
├── manifest.json         # Chrome extension config (Manifest V3)
├── config.example.js     # Template — copy to config.js and add your key
├── config.js             # Your API key (git-ignored)
├── content_script.js     # Core engine — intercepts & translates subtitles
├── bridge.js             # Messenger between ISOLATED and MAIN worlds
├── popup.html            # Extension popup UI
└── popup.js              # Popup logic and settings management
```

## ⚠️ Important

- `config.js` is **git-ignored** — your API key stays local
- Google Translate API has a [free tier](https://cloud.google.com/translate/pricing) (500K chars/month), after which charges apply
- This extension works with English subtitles → any target language
