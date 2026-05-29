# GuessTheCard — Design / Spec

**Datum:** 2026-05-29
**Status:** Genehmigt (Brainstorming abgeschlossen, bereit für Implementierungsplan)

## Überblick

Ein browserbasiertes Ratespiel rund um **Magic: The Gathering**-Karten. Datenquelle ist die
**Scryfall-API**. Erste und einzige implementierte Spielvariante ist der **Progressive-Reveal-Modus**:
Der Spieler sieht zunächst nur das Artwork einer Zielkarte und deckt durch korrektes Erraten
einzelner Attribute (Farbe, Manawert, Typ, Power …) schrittweise mehr Informationen auf, bis er
den Kartennamen per Multiple Choice errät.

Die App ist **mobile-first** (Hauptzielgerät: Smartphone), als **PWA installierbar** und setzt auf
ein flaches **2D-Karten-Rendering** mit progressiver Aufdeckung (CSS/DOM, Framer-Motion-Übergänge).

**Ruflo** wird ausschließlich als **Entwicklungs-Werkzeug** verwendet (Agent-Swarm, Memory,
Workflows zur parallelen Implementierung) und ist **nicht** Teil des laufenden Spiels.

## Ziele / Nicht-Ziele

**Ziele**
- Spielbarer Progressive-Reveal-Modus mit Scryfall-Daten.
- Mobile-first, touch-optimiert, als PWA installierbar.
- Grafisch ansprechend (2D-Kartenbild mit progressiver Aufdeckung: Graustufen, Blur-Regionen).
- Saubere, erweiterbare Modus-Architektur (weitere Modi später ohne UI-Umbau).
- Auswählbarer Kartenpool beim Start.

**Nicht-Ziele (vorerst)**
- Multiplayer, Accounts, serverseitige Highscores.
- Weitere Spielmodi (nur Interface vorbereitet, nicht implementiert — YAGNI).
- Eigenes Backend (reine Client-App).
- Voller Offline-Spielbetrieb (PWA cacht App-Shell + Bilder, neue Karten brauchen Netz).
- Ruflo als Laufzeit-Feature im Spiel.

## Spielmechanik (Progressive-Reveal-Modus)

**Setup**
- Beim Start wählt der Spieler den **Kartenpool**:
  1. Beliebte/bekannte Karten (Scryfall-Filter, z. B. EDH-Popularität / Standard-Sets)
  2. Nach Set/Edition wählbar (ein oder mehrere Sets)
  3. Komplett zufällig (alle Karten)
- Pro Runde zieht die Engine eine **Zielkarte** aus dem Pool sowie passende Distraktoren.

**Anzeige**
- Zuerst nur das **Artwork** (`image_uris.art_crop`), leicht verschwommen/abgedunkelt.
- Daneben/darunter eine **Attribut-Leiste** mit verdeckten Feldern: Farbe, Manawert (CMC),
  Typ, Power/Toughness (optional weitere wie Seltenheit).

**Interaktionen pro Runde**
1. **Attribut raten** — Spieler wählt ein verdecktes Attribut und gibt einen Wert an
   (Farbe via WUBRG-Auswahl, CMC als Zahl, Typ aus Liste, Power als Zahl).
   - Richtig → Attribut wird dauerhaft aufgedeckt (Hinweis bleibt sichtbar) + Reveal-Effekt.
   - Falsch → kein Reveal, Punktabzug.
2. **Kartennamen raten (Multiple Choice)** — jederzeit möglich: 4–6 Namensvorschläge.
   Die Distraktoren sind **konsistent mit den bereits aufgedeckten Attributen** (decke ich
   Rot + CMC 3 auf, sind alle Optionen rote 3-Mana-Karten). Aufdecken macht die Auswahl
   gezielt leichter → echte Deduktion.

**Rundenende & Scoring**
- Startbudget pro Runde, z. B. **1000 Punkte**.
- Jedes **aufgedeckte Attribut**: −150 vom möglichen Gewinn.
- Jeder **falsche Attribut-Versuch**: −50.
- Jeder **falsche Namensversuch**: −200 (beendet die Runde **nicht** sofort — weiterer Versuch
  möglich, bis das Budget aufgebraucht ist, dann wird die Karte aufgelöst).
- Richtiger Name ohne Reveal = Maximalpunkte.
- Mehrere Runden → kumulativer Score + Streak-Anzeige.

## Architektur

Reine Client-App: **React + Vite + TypeScript**. Drei klar getrennte Schichten.

```
src/
  scryfall/
    client.ts        # fetchRandomCard(query), fetchCandidates(filters) + Rate-Limit-Delay
    types.ts         # ScryfallCard (nur benötigte Felder)
  engine/            # framework-unabhängig, rein testbar (kein React, kein Three.js)
    types.ts         # GameMode-Interface, Round, Attribute, GuessResult, Score
    attributes.ts    # color/cmc/type/power-Definitionen + Vergleichslogik
    modes/
      progressiveReveal.ts   # erste & einzige Modus-Implementierung
  state/
    gameStore.ts     # Zustand der Partie (Runde, Reveals, Score) — z. B. Zustand
  scene/             # 2D-Karten-View (kennt nur Engine-Output, keine Spielregeln)
    CardStage.tsx    # Flaches Kartenbild + Graustufen-/Blur-Aufdeckung (CSS, Framer Motion)
  ui/                # React-DOM-Overlay (Framer Motion)
    PoolSelect.tsx
    AttributeBar.tsx
    AttributeGuess.tsx
    NameChoice.tsx
    Scoreboard.tsx
    HUD.tsx
  App.tsx
```

**Schichten**
- **engine/** — pure Logik, vollständig unit-testbar.
- **scene/** — 2D-Rendering; erhält Kartenbild + Reveal-Status aus dem Store, kennt keine Regeln.
- **ui/** — DOM-Overlay für Eingaben/Anzeigen, schwebt per CSS über der Karten-Bühne.

**GameMode-Interface (Kern der Erweiterbarkeit)**
- `startRound(pool) → Round` — zieht Zielkarte + Distraktoren.
- `revealable() → Attribute[]` — welche Attribute ratbar sind.
- `guessAttribute(attr, value) → GuessResult` — richtig ⇒ Reveal.
- `nameChoices() → string[]` — aktuelle Optionen, konsistent mit Reveals.
- `guessName(name) → GuessResult` — Namensversuch.
- `score(state) → number`.

Die UI kennt nur dieses Interface → neuer Modus = neue Datei in `modes/`, keine UI-Änderung.

**Datenfluss**
UI-Event → `gameStore` → aktive `GameMode`-Methode → ggf. `scryfall/client` → Ergebnis in Store →
Store-Update triggert beide Views: `scene/` aktualisiert die Karten-Aufdeckung, `ui/` aktualisiert
Attribut-Leiste/Score.

## Rendering & Aufdeckung (2D / CSS)

Das `image_uris.normal`-Vollbild der Zielkarte ist die **gesamte Runde** sichtbar und wird
schrittweise aufgedeckt. Der Kartenpool ist auf Karten mit modernem Rahmen (`frame:2015`)
beschränkt, damit die festen Aufdeckungs-Rechtecke zum Layout passen.

- **Graustufen bis Farbe:** Das Kartenbild ist mit `filter: grayscale(1)` entsättigt, bis das Farb-
  Attribut erraten ist (oder die Runde endet); dann zeigt es sich in voller Farbe (mit Filter-Transition).
- **Immer farbiges Artwork:** Solange die Farbe noch nicht aufgedeckt ist, liegt eine zweite,
  unveränderte Kopie desselben Bildes deckungsgleich darüber und wird per `clip-path: inset(...)`
  auf das Art-Fenster beschnitten — gleiches Bild + gleiche Box = perfekte Registrierung.
- **Blur-Regionen pro Attribut:** Manakosten (oben rechts), Typzeile (unter dem Art) und —
  nur bei Kreaturen — Power/Toughness (unten rechts) sind je mit einem absolut positionierten Div
  (`backdrop-filter: blur(7px)`, leichter dunkler Tint, feine Border) verdeckt. Wird das Attribut
  aufgedeckt (oder die Runde endet), verschwindet das Overlay (Framer-Motion-Fade).
- **Rundenende:** alle Regionen werden aufgedeckt und die Karte zeigt sich vollständig in Farbe.

## Mobile-First & PWA

**Layout**
- Portrait als Standard: Karten-Bühne oben, Eingaben/Multiple-Choice als tippbares Panel unten
  (Daumen-Bereich). Desktop = breitere Variante. Touch-Targets ≥ 44px, keine Hover-Abhängigkeit.

**Performance**
- Kein 3D/WebGL — reines DOM/CSS, dadurch günstig auf schwachen Geräten.
- Bilder in passender Größe (`normal`, nicht `png`/`large`), lazy laden.
- `backdrop-filter`/`filter`-Transitions sparsam und nur auf der Karten-Bühne.

**PWA**
- `vite-plugin-pwa`: Manifest (Name, Icons, Theme, Portrait, Standalone) + Service Worker.
- Caching: App-Shell precachen; Scryfall-Bilder runtime CacheFirst (mit Limit);
  Scryfall-API NetworkFirst. Voller Offline-Betrieb ist Nicht-Ziel.

## Fehlerbehandlung (Systemgrenze = Scryfall)

- Netzwerk-/API-Fehler beim Kartenziehen → Retry mit Backoff, dann Fehlermeldung + „Neue Karte".
- Karte ohne `art_crop` → überspringen, nächste ziehen.
- Rate-Limit (HTTP 429) → ~100 ms Delay zwischen Requests einhalten; bei 429 warten/retry.
- Bild-Ladefehler → Platzhalter + Reload.

## Tests

- **engine/** (Vitest, gemockte Kartendaten): Attribut-Vergleich, Reveal-Logik, Scoring,
  Multiple-Choice-Konsistenz mit Reveals.
- **scryfall/client** (gemocktes `fetch`): korrekte Queries, Rate-Limit-Delay, Fehlerpfade.
- **scene/ & ui/**: leichte Smoke-Tests; das 2D-Aufdeckungsverhalten wird per E2E (Playwright)
  über `data-testid` (`card-image`, `blur-mana`, `blur-type`, `blur-power`) geprüft.

## Deployment (GitHub Pages)

Ziel-Repo: **pepate/guessthecardmtg** (public). Auslieferung als statische Seite über GitHub Pages —
passt, weil die App rein client-seitig ist (Vite-Build, Scryfall direkt vom Browser, kein Backend;
Scryfall erlaubt CORS).

- **Base-Path:** Project-Pages liefern unter `https://pepate.github.io/guessthecardmtg/` aus.
  In `vite.config.ts` daher `base: '/guessthecardmtg/'` setzen, sonst laden Assets nicht.
- **PWA-Scope:** Service-Worker + Manifest (`start_url`, `scope`, Icon-Pfade) müssen denselben
  Unterpfad nutzen. `vite-plugin-pwa` leitet das meiste aus `base` ab; betroffene Felder explizit setzen.
- **CI/CD:** GitHub-Actions-Workflow (`.github/workflows/deploy.yml`) baut bei Push auf `main`
  mit Vite und published nach Pages (offizielle `actions/deploy-pages`). Kein `gh-pages`-Branch.
- **Hinweis:** Bei späterer Custom-Domain entfällt der Unterpfad (Root) und Punkte 1/2 vereinfachen sich.

## Ruflo im Entwicklungsprozess

- Installiert via `npx ruflo init` (V3): `.claude/` (Agents/Commands/Skills), `.mcp.json`
  (MCP-Server, **erst nach Neustart von Claude Code aktiv**), Hooks in `settings.json`.
- Nutzung: bei der Implementierung Agent-Swarm + Memory, um die unabhängigen Schichten
  (scryfall/, engine/, scene/, ui/) parallel von spezialisierten Agenten bauen zu lassen.
- Voraussetzung: Claude Code einmal neu starten, damit der Ruflo-MCP-Server geladen wird.

## Offene Punkte / spätere Erweiterungen

- Weitere Spielmodi (z. B. Wordle-artige Texthinweise, „welche Karte ist teurer?").
- Vorab geladener Pool für echten Offline-Betrieb.
- Persistente Highscores/Streaks (lokal via IndexedDB, später evtl. Backend).
