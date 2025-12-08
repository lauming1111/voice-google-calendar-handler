# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.1.0 (2025-12-08)


### Features

* **backend:** add ollama ([6af4c15](https://github.com/lauming1111/voice-google-calendar-handler/commit/6af4c154517bdb1abd4e7039d964c160079b96ae))
* **backend:** add opening ([a7a4e3f](https://github.com/lauming1111/voice-google-calendar-handler/commit/a7a4e3f0d65fa0f33f01693c422a5bb9f0a349f7))
* **backend:** add playwright ([38b9dc2](https://github.com/lauming1111/voice-google-calendar-handler/commit/38b9dc239dd1fc802ba10c51097b3dc9a19cc58a))
* **backend:** adjust AI system_prompt ([581d4fd](https://github.com/lauming1111/voice-google-calendar-handler/commit/581d4fd3ff0d2966c8e6915ffce2e307f6884032))
* **backend:** close chromium when finish all actions ([1b347bb](https://github.com/lauming1111/voice-google-calendar-handler/commit/1b347bbc3f7786f0a25e921f168157db114cb6be))
* **backend:** handle incomplete input ([c45db40](https://github.com/lauming1111/voice-google-calendar-handler/commit/c45db407c74913f18afe9a431f87549786e162ba))
* **backend:** playwright changes title ([ed65eae](https://github.com/lauming1111/voice-google-calendar-handler/commit/ed65eae0cfc74ad6a00c461204913fa9c9502127))
* **backend:** playwright click activity ([79d8241](https://github.com/lauming1111/voice-google-calendar-handler/commit/79d8241ff8a2dda0a2a3b31b7f6ff0cd9e7d8e35))
* **backend:** playwright click event ([9b585a2](https://github.com/lauming1111/voice-google-calendar-handler/commit/9b585a2386335a1f59aa382f446e62c6770dcfd1))
* **backend:** playwright date time parser ([0669dd1](https://github.com/lauming1111/voice-google-calendar-handler/commit/0669dd19c23f2e1244a9a722b8b6d42f0e92dd8b))
* **backend:** playwright enter date time + delay ([5bbe3ad](https://github.com/lauming1111/voice-google-calendar-handler/commit/5bbe3ad893d7d4116e10dfbe4ba2c4d024c158c3))
* **backend:** playwright save event ([f260d48](https://github.com/lauming1111/voice-google-calendar-handler/commit/f260d487530583d45493c932cad6fccc045cf228))
* **frontend:** add opening when recording ([6e5c1ca](https://github.com/lauming1111/voice-google-calendar-handler/commit/6e5c1cabbfba037572f6c714020e2f16a3eb2e46))
* **frontend:** add text message input ([4b32291](https://github.com/lauming1111/voice-google-calendar-handler/commit/4b32291d03185038270868ea848b1411f80f0009))
* **frontend:** basic voice input button ([7db6960](https://github.com/lauming1111/voice-google-calendar-handler/commit/7db69601fc7902fed3cb464f83e74a7fec90a96a))
* **frontend:** prevent duplicate requests of button Send text command ([4e5ef67](https://github.com/lauming1111/voice-google-calendar-handler/commit/4e5ef6721307857141d65f1007e3ee995ad968b0))
* **frontend:** re-work record button ([58c3e70](https://github.com/lauming1111/voice-google-calendar-handler/commit/58c3e70c616ea8a6a19c025fa2c69ff9614727ab))

# Changelog

## Unreleased
- Added voice command flow with live captions in the React client, plus friendlier error copy.
- Improved manual text command path and UI hints for calendar actions.
- Hardened Playwright date/time filling with locale fallbacks (English/Chinese labels) and slow-mode delays.
- Added automatic browser teardown after calendar actions.
- Documented setup for Chrome path, Playwright, and Ollama (`gpt-oss:latest`) model usage.
