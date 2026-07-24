export default function App() {
  return (
    <div class="shell">
      <header class="topline">
        <a class="wordmark" href="/" aria-label="Tildom home">tildom</a>
        <span class="tab" aria-current="page">[ home.txt ]</span>
        <a class="github" href="https://github.com/bart-jaskulski/tildom">github ↗</a>
      </header>

      <main>
        <section class="launcher" aria-labelledby="page-title">
          <h1 id="page-title">Small tools. Your data.</h1>
          <p class="intro">
            A family of focused personal applications that begin on your device,
            work offline, and stay out of your way.
          </p>

          <nav aria-label="Tildom applications">
            <ul class="apps">
              <li>
                <a class="app-link" href="https://mark.tildom.app">
                  <span class="index" aria-hidden="true">1</span>
                  <svg class="app-icon" viewBox="0 0 64 64" aria-hidden="true">
                    <rect width="64" height="64" fill="#24292e"/>
                    <rect x="8" y="8" width="48" height="48" fill="#d73a49"/>
                    <path fill="#fff" d="M21 16h22v34L32 43l-11 7z"/>
                  </svg>
                  <span class="app-name">mark</span>
                  <span class="app-desc">bookmarks and notes</span>
                  <span class="arrow" aria-hidden="true">→</span>
                </a>
              </li>
              <li>
                <a class="app-link" href="https://do.tildom.app">
                  <span class="index" aria-hidden="true">2</span>
                  <svg class="app-icon" viewBox="0 0 64 64" aria-hidden="true">
                    <rect width="64" height="64" fill="#24292e"/>
                    <rect x="8" y="8" width="48" height="48" fill="#005cc5"/>
                    <path d="M19 19h26v26H19z" fill="none" stroke="#fff" stroke-width="5"/>
                    <path d="m24 32 6 6 11-13" fill="none" stroke="#fff" stroke-width="5"/>
                  </svg>
                  <span class="app-name">do</span>
                  <span class="app-desc">tasks and next actions</span>
                  <span class="arrow" aria-hidden="true">→</span>
                </a>
              </li>
              <li>
                <a class="app-link" href="https://kin.tildom.app">
                  <span class="index" aria-hidden="true">3</span>
                  <svg class="app-icon" viewBox="0 0 64 64" aria-hidden="true">
                    <rect width="64" height="64" fill="#24292e"/>
                    <rect x="8" y="8" width="48" height="48" fill="#005cc5"/>
                    <path d="m22 22 10 20 10-20M22 22h20" fill="none" stroke="#fff" stroke-width="5"/>
                    <path fill="#fff" d="M17 17h10v10H17zm20 0h10v10H37zM27 37h10v10H27z"/>
                  </svg>
                  <span class="app-name">kin</span>
                  <span class="app-desc">people and relationships</span>
                  <span class="arrow" aria-hidden="true">→</span>
                </a>
              </li>
              <li>
                <a class="app-link" href="https://hey.tildom.app">
                  <span class="index" aria-hidden="true">4</span>
                  <svg class="app-icon" viewBox="0 0 64 64" aria-hidden="true">
                    <rect width="64" height="64" fill="#24292e"/>
                    <rect x="8" y="8" width="48" height="48" fill="#d73a49"/>
                    <path fill="#fff" d="m17 20 14 12-14 12v-8l5-4-5-4zm17 18h13v6H34z"/>
                  </svg>
                  <span class="app-name">hey</span>
                  <span class="app-desc">private AI conversations</span>
                  <span class="arrow" aria-hidden="true">→</span>
                </a>
              </li>
            </ul>
          </nav>
        </section>

        <aside class="ledger" aria-labelledby="ledger-title">
          <div>
            <p class="ledger-label" id="ledger-title">shared foundation</p>
            <dl>
              <div class="principle">
                <dt>local-first</dt>
                <dd>Your personal data begins in the browser, not on somebody else's server.</dd>
              </div>
              <div class="principle">
                <dt>offline-ready</dt>
                <dd>The core tools remain useful when the network disappears.</dd>
              </div>
              <div class="principle">
                <dt>open source</dt>
                <dd>The code is available to inspect, run, and improve on GitHub.</dd>
              </div>
            </dl>
          </div>

          <p class="local-note">
            <strong>You should own your everyday software.</strong>
            <span>Tildom is built around that idea.</span>
          </p>
        </aside>
      </main>
    </div>
  );
}
