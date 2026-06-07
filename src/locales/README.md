# DisplaySong Translations / Übersetzungen

## Adding a new language / Neue Sprache hinzufügen

1. Copy `en.json` to a new file named with your language code (e.g. `fr.json` for French)
2. Update the `meta` section:
   ```json
   "meta": {
     "language": "Français",
     "code": "fr",
     "author": "Your Name",
     "version": "1.0.0"
   }
   ```
3. Translate all values (not the keys!)
4. Create a Pull Request or share your translation

## Language Codes / Sprachcodes

Use ISO 639-1 codes:
- `de` - German / Deutsch
- `en` - English
- `fr` - French / Français
- `es` - Spanish / Español
- `it` - Italian / Italiano
- `pt` - Portuguese / Português
- `nl` - Dutch / Nederlands
- `pl` - Polish / Polski
- `ru` - Russian / Русский
- `ja` - Japanese / 日本語
- `ko` - Korean / 한국어
- `zh` - Chinese / 中文

## Placeholders / Platzhalter

Some strings contain placeholders like `{name}`. Keep these exactly as they are:

```json
"connectedAs": "Connected as {name}"  // ✓ Correct
"connectedAs": "Connected as name"    // ✗ Wrong
```

## Testing / Testen

1. Place your JSON file in the `%APPDATA%/com.displaysong.app/locales` folder
2. Start the app
3. Go to Settings → Appearance → Language
4. Select your language

## Questions / Fragen

Open an issue on GitHub if you need help!
