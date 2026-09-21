# Release cheat sheet — Aiden

Comandi rapidi per pubblicare una versione e testare l'autoupdate.

Repo: [Pura-Digital/pura-coworker](https://github.com/Pura-Digital/pura-coworker)

---

## Release ufficiale (GitHub + autoupdate)

La CI parte **automaticamente** al push di un tag `v*`.

### 1. Bump versione

Aggiorna `version` in `package.json` (es. `3.4.1` → `3.4.2`).

Opzionale: aggiorna `CHANGELOG.md`.

### 2. Commit su `main`

```bash
git checkout main
git pull origin main

git add package.json CHANGELOG.md   # + altri file se servono
git commit -m "chore(release): v3.4.2"
git push origin main
```

### 3. Tag + push (trigger CI Release)

```bash
git tag v3.4.2
git push origin v3.4.2
```

Sostituisci `v3.4.2` con la versione reale. **Il tag deve coincidere con `package.json`** (con prefisso `v`).

### 4. Monitora la CI

```bash
gh run list --workflow=release.yml --limit 5
gh run watch   # oppure apri Actions su GitHub
```

Workflow: `.github/workflows/release.yml`

Build:
- **macOS** → `Aiden-x.y.z-mac-arm64.dmg`, `Aiden-x.y.z-mac-x64.dmg`, `.zip` (per arch), `latest-mac.yml`, `.blockmap`
- **Windows** → `Aiden-x.y.z-win-x64.exe`, `latest.yml`, `.blockmap`

### 5. Verifica release

```bash
gh release view v3.4.2
open "https://github.com/Pura-Digital/pura-coworker/releases/tag/v3.4.2"
```

Controlla che ci siano almeno:
- macOS: `latest-mac.yml` + zip (l'autoupdate usa lo **zip**, non il DMG)
- Windows: `latest.yml` + exe

Verifica feed autoupdate:

```bash
curl -sL "https://github.com/Pura-Digital/pura-coworker/releases/download/v3.4.2/latest-mac.yml" | head
```

---

## Build locale (test prima del tag)

Per installare manualmente senza pubblicare su GitHub:

```bash
npm run clean          # opzionale, pulisce artefatti precedenti
npm run build          # macOS: richiede CSC_* per firma (vedi sotto)
```

Output in `release/`:
- `Aiden-x.y.z-mac-arm64.dmg` (Apple Silicon)
- `Aiden-x.y.z-mac-x64.dmg` (Intel)
- `Aiden-x.y.z-mac-arm64.zip` / `Aiden-x.y.z-mac-x64.zip`

Installazione manuale:

```bash
# Apple Silicon
open release/Aiden-3.4.2-mac-arm64.dmg
# oppure
cp -R release/mac-arm64/Aiden.app /Applications/

# Intel Mac
open release/Aiden-3.4.2-mac-x64.dmg
# oppure
cp -R release/mac-x64/Aiden.app /Applications/

xattr -cr /Applications/Aiden.app
```

Build Windows (su mac/Linux via script):

```bash
npm run build:win
```

---

## Test autoupdate

1. Installa una versione **precedente** (es. 3.4.0) — da release GitHub o build locale.
2. Pubblica la nuova versione su GitHub (tag + CI completata).
3. Avvia l'app installata (cold start) oppure menu **Aiden → Check for Updates…**
4. Dovresti vedere:
   - toast in basso a sinistra → download → restart
   - menu che passa a **Restart to Update** a download finito

Se sei già aggiornato: **Check for Updates…** mostra *You're on the latest version*.

Note:
- L'autoupdate legge **solo GitHub Releases**, non build locali non pubblicati.
- In dev (`npm run dev`) l'updater è disabilitato.
- Su macOS serve quit completo (**Cmd+Q**), non solo chiudere la finestra.

Cache updater (debug):

```bash
ls ~/Library/Caches/aiden-updater
```

---

## Comandi utili

```bash
# Tag già pushato per errore (solo se nessuno l'ha ancora usato!)
git push origin :refs/tags/v3.4.2
git tag -d v3.4.2

# Ricreare tag sul commit corrente
git tag v3.4.2
git push origin v3.4.2

# Ultima release su GitHub
gh release list --limit 5

# Log CI fallita
gh run list --workflow=release.yml --limit 3
gh run view <RUN_ID> --log-failed
```

---

## Firma macOS (build locale)

La CI usa i secret `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, ecc.

Per build locali firmate, esporta le variabili prima di `npm run build`:

```bash
# Esempio — adatta ai tuoi certificati
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD='...'
export APPLE_ID='...'
export APPLE_APP_SPECIFIC_PASSWORD='...'
export APPLE_TEAM_ID='...'

npm run build
```

Build non firmato: l'app parte, ma l'autoupdate potrebbe fallire in installazione su macOS.

---

## Checklist veloce

- [ ] `package.json` → versione bumpata
- [ ] Commit su `main`
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] CI Release verde (macOS + Windows)
- [ ] Asset su GitHub: `latest-mac.yml` / `latest.yml` + binari
- [ ] Test autoupdate da versione precedente
