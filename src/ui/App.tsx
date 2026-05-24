/* ============================================================
   APP  ( src/ui/ )  — STAGE 1 REWORK
   React root. A game lives in one of three localStorage slots and
   autosaves after every meaningful change.

   Screens:
     home          : pick a save slot
     choose-style  : found a museum (pick a style)
     name-gallery  : name the gallery, set opening ticket price
     playing       : the tabbed game
       Galleries / Map / This Week / Specialties / Manage
       Competitors / Codex
     ended         : final score
   ============================================================ */
import { useState, useEffect, useRef, useCallback } from 'react';
import './styles.css';
import type {
  GameState, StyleId, Room, SaveSlot, GameEvent, Expedition,
} from '../data/types';
import {
  STYLES, STYLE_IDS, ART_TYPES, BUILDINGS, AD_CAMPAIGN, START,
  AUCTION_HOUSES, EXPEDITION_TIERS, SUMMON_COST,
  DISTRICTS, districtOfBuilding, typeIcon, rarityForScore,
  RARITY_BANDS, STATIC_MUSEUMS,
} from '../data/constants';
import { ARTIFACTS, ARTIFACT_BY_ID } from '../data/artifacts';
import * as E from '../engine/game';
import * as Auc from '../engine/auction';
import * as Dig from '../engine/digboard';
import * as Gala from '../engine/gala';
import * as BM from '../engine/blackmarket';
import * as Saves from '../engine/saves';
import { money, stars } from '../engine/util';
import { Thumb, RarityPill, ArtifactDetail } from './components';

type Tab =
  | 'galleries' | 'map' | 'week' | 'specialties'
  | 'manage' | 'competitors' | 'codex';

/* ============================================================
   ROOT — owns the active slot, routes home vs in-game
   ============================================================ */
export default function App() {
  const [slot, setSlot] = useState<number | null>(null);
  const [state, setState] = useState<GameState | null>(null);

  // start a brand-new game in a slot
  const startNew = (s: number) => {
    setSlot(s);
    setState(E.newGame());
  };
  // load an existing slot
  const loadGame = (s: number) => {
    const rec = Saves.loadSlot(s);
    if (rec) { setSlot(s); setState(rec.state); }
  };
  // back to the home screen
  const toHome = () => { setSlot(null); setState(null); };

  if (slot === null || !state) {
    return <Home onNew={startNew} onLoad={loadGame} />;
  }
  return (
    <Game slot={slot} initial={state} onExit={toHome} />
  );
}

/* ============================================================
   HOME — three save slots
   ============================================================ */
function Home({
  onNew, onLoad,
}: {
  onNew: (slot: number) => void;
  onLoad: (slot: number) => void;
}) {
  const [slots, setSlots] = useState<(SaveSlot | null)[]>(() => Saves.listSlots());
  const refresh = () => setSlots(Saves.listSlots());

  return (
    <div className="home-wrap">
      <div className="home-title">Museum Wars</div>
      <div className="home-sub">Build a museum to rival the world's greatest.</div>
      {slots.map((rec, i) => (
        <div key={i} className={'slot-card' + (rec ? '' : ' empty')}>
          <div className="slot-head">
            <div className="slot-name">
              {rec ? rec.galleryName : `Empty Slot ${i + 1}`}
            </div>
            <div className="slot-meta">Slot {i + 1}</div>
          </div>
          {rec ? (
            <>
              <div className="slot-meta">
                {rec.playerName} · Week {rec.week} · {rec.fame} fame
              </div>
              <div className="slot-actions">
                <button onClick={() => onLoad(i)}>Continue</button>
                <button className="ghost"
                  onClick={() => {
                    if (confirm('Delete this saved game?')) {
                      Saves.deleteSlot(i); refresh();
                    }
                  }}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <div className="slot-actions">
              <button onClick={() => onNew(i)}>New Game</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   GAME — one active slot. Autosaves on every state change.
   ============================================================ */
function Game({
  slot, initial, onExit,
}: {
  slot: number;
  initial: GameState;
  onExit: () => void;
}) {
  const [state, setRawState] = useState<GameState>(initial);
  const [tab, setTab] = useState<Tab>('galleries');
  const [toast, setToast] = useState<string | null>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);
  // a confirm prompt before advancing the week with events pending
  const [confirmSkip, setConfirmSkip] = useState(false);
  // the id of an expedition whose result mini-game is open
  const [expeditionGame, setExpeditionGame] = useState<string | null>(null);
  // whether the gala screen is open
  const [galaOpen, setGalaOpen] = useState(false);
  // whether the black-market screen is open
  const [blackMarketOpen, setBlackMarketOpen] = useState(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 2600);
  }, []);

  /* --- autosave: persist the slot whenever state changes ---- */
  const setState = useCallback((s: GameState) => {
    setRawState(s);
    Saves.saveSlot(slot, s);
  }, [slot]);

  /* --- auction tick loop ----------------------------------- */
  const lastRef = useRef<number>(0);
  useEffect(() => {
    // frozen during the intro pause and once the lot is over
    if (!state.auction || state.auction.over
        || state.auction.mode === 'intro') return;
    lastRef.current = performance.now();
    const handle = window.setInterval(() => {
      setRawState(s => {
        if (!s.auction || s.auction.over || s.auction.mode === 'intro') return s;
        const now = performance.now();
        const delta = now - lastRef.current;
        lastRef.current = now;
        return { ...s, auction: Auc.tickAuction(s, delta) };
      });
    }, 100);
    return () => window.clearInterval(handle);
  }, [state.auction?.over, state.auction?.artifactId, state.auction?.mode]);
  // when an auction resolves, persist once
  useEffect(() => {
    if (state.auction?.over) Saves.saveSlot(slot, state);
  }, [state.auction?.over, slot, state]);

  const apply = (res: { state: GameState; error?: string }) => {
    if (res.error) { flash(res.error); return; }
    setState(res.state);
  };

  /* --- onboarding screens ---------------------------------- */
  if (state.phase === 'choose-specialty') {
    return <ChooseStyle
      onPick={(artId, all) =>
        setState(E.chooseFoundingArtwork(state, artId, all))}
      onExit={onExit} />;
  }
  if (state.phase === 'name-gallery') {
    return <NameGallery state={state}
      onConfirm={(pn, gn, ticket) =>
        setState(E.nameGallery(state, pn, gn, ticket))} />;
  }

  /* --- next week, with skip-events confirm ----------------- */
  const doNextWeek = () => {
    if (state.events.length > 0) { setConfirmSkip(true); return; }
    setState(E.advanceWeek(state));
  };
  const confirmSkipYes = () => {
    setConfirmSkip(false);
    setState(E.advanceWeek(state));
  };
  const confirmSkipNo = () => {
    setConfirmSkip(false);
    setTab('week');
  };

  /* --- body ------------------------------------------------ */
  let body: React.ReactNode;
  if (openArtifactId) {
    body = <ArtifactDetail artifact={ARTIFACT_BY_ID[openArtifactId]}
      onBack={() => setOpenArtifactId(null)} />;
  } else if (expeditionGame) {
    const exp = state.expeditions.find(e => e.id === expeditionGame);
    body = exp ? (
      <ExpeditionGame state={state} expedition={exp}
        onFinish={result => {
          apply(E.resolveExpedition(state, exp.id, result));
          setExpeditionGame(null);
        }} />
    ) : null;
  } else if (blackMarketOpen) {
    body = (
      <BlackMarketScreen state={state}
        onBuy={(artId, outcome) => {
          apply(E.buyBlackMarket(state, artId, outcome));
        }}
        onClose={() => {
          setRawState(s => ({ ...s, blackMarketPending: false }));
          setBlackMarketOpen(false);
        }} />
    );
  } else if (galaOpen) {
    body = (
      <GalaScreen state={state}
        onAccept={(artId, weeks, fee, lender) => {
          apply(E.acceptLoan(state, artId, weeks, fee, lender));
        }}
        onClose={() => {
          setRawState(s => ({ ...s, galaPending: false }));
          setGalaOpen(false);
        }} />
    );
  } else if (confirmSkip) {
    body = (
      <div className="panel">
        <h2>Events This Week<span className="sub">before you move on</span></h2>
        <p className="empty-note">
          There {state.events.length === 1 ? 'is' : 'are'} {state.events.length}
          {' '}acquisition opportunit{state.events.length === 1 ? 'y' : 'ies'} this
          week. If you advance now they will be missed.
        </p>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={confirmSkipNo}>See the Events</button>
          <button className="ghost" onClick={confirmSkipYes}>
            Skip &amp; Advance the Week
          </button>
        </div>
      </div>
    );
  } else if (tab === 'galleries') {
    body = <GalleriesTab state={state} apply={apply} flash={flash}
      setState={setState} onArtifact={setOpenArtifactId} />;
  } else if (tab === 'map') {
    body = <MapTab state={state} apply={apply} setState={setState}
      flash={flash} goGalleries={() => setTab('galleries')} />;
  } else if (tab === 'week') {
    body = <WeekTab state={state} setState={setState} flash={flash}
      goGalleries={() => setTab('galleries')} onNextWeek={doNextWeek}
      onExpeditionResult={expId => setExpeditionGame(expId)}
      onGala={() => setGalaOpen(true)}
      onBlackMarket={() => setBlackMarketOpen(true)} />;
  } else if (tab === 'specialties') {
    body = <SpecialtiesTab state={state} apply={apply} />;
  } else if (tab === 'manage') {
    body = <ManageTab state={state} setState={setState} apply={apply} />;
  } else if (tab === 'competitors') {
    body = <CompetitorsTab state={state} />;
  } else {
    body = <CodexTab state={state} onArtifact={setOpenArtifactId} />;
  }

  return (
    <Shell state={state} tab={tab}
      setTab={t => { setOpenArtifactId(null); setConfirmSkip(false); setTab(t); }}
      onExit={onExit} onNextWeek={doNextWeek}>
      {body}
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

/* ============================================================
   SHELL — header (with Next Week), stat strip, tab bar
   ============================================================ */
function Shell({
  state, tab, setTab, hideTabs, onExit, onNextWeek, children,
}: {
  state: GameState; tab: Tab; setTab: (t: Tab) => void;
  hideTabs?: boolean; onExit: () => void; onNextWeek: () => void;
  children: React.ReactNode;
}) {
  const tabs: [Tab, string][] = [
    ['galleries', 'Galleries'], ['map', 'Map'], ['week', 'Week'],
    ['specialties', 'Styles'], ['manage', 'Manage'],
    ['competitors', 'Rivals'], ['codex', 'Codex'],
  ];
  const inGame = state.phase === 'playing';
  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ cursor: 'pointer' }} onClick={onExit}>Museum Wars</h1>
          <span className="tagline">{state.galleryName || 'a 50-week run'}</span>
        </div>
        {inGame && (
          <button className="next-week-btn" onClick={onNextWeek}>
            Next Week →
          </button>
        )}
      </header>
      <div className="stats">
        <Stat label="Week" value={String(state.week)} />
        <Stat label="Funds" value={money(state.funds)} />
        <Stat label="Fame" value={String(E.totalFame(state))} />
        <Stat label="Quality" value={String(E.museumQuality(state))} />
        <Stat label="Revenue" value={money(state.lastRevenue)} />
        <Stat label="Upkeep" value={money(state.lastExpenses)} />
      </div>
      {!hideTabs && (
        <div className="tabs">
          {tabs.map(([id, label]) => (
            <div key={id} className={'tab' + (tab === id ? ' active' : '')}
              onClick={() => setTab(id)}>{label}</div>
          ))}
        </div>
      )}
      <main>{children}</main>
    </>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

/* ============================================================
   ONBOARDING — choose style
   ============================================================ */
function ChooseStyle({
  onPick, onExit,
}: {
  onPick: (artId: string, allChoices: string[]) => void;
  onExit: () => void;
}) {
  const [offered] = useState<string[]>(() => E.foundingArtworkChoices());
  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ cursor: 'pointer' }} onClick={onExit}>Museum Wars</h1>
          <span className="tagline">a family inheritance</span>
        </div>
      </header>
      <main>
        <div className="panel">
          <h2>The Inheritance
            <span className="sub">your grandparent's legacy</span></h2>
          <p className="empty-note">
            Your grandparent was a lifelong collector of art. Their will leaves
            three treasured works to be divided among the grandchildren — and
            the eldest chooses first. You.
          </p>
          <p className="empty-note">
            Choose the piece that will found your museum; your collection will
            specialise in its style, and it will hang from your opening day.
            The two works you leave behind pass to your cousins — who will open
            museums of their own, and become your rivals.
          </p>
          <div className="divider" />
          {offered.map(id => {
            const art = ARTIFACT_BY_ID[id];
            const band = rarityForScore(art.score);
            return (
              <div className="row" key={id}>
                <div className="meta">
                  <div className="name">
                    {typeIcon(art.type)} {art.name}
                  </div>
                  <div className="info">
                    {art.type} · {STYLES[art.style].name} · {art.year} —{' '}
                    {art.description}
                  </div>
                  <div className="info" style={{ marginTop: 2 }}>
                    <span className={'pill ' + band.cls}>{band.name}</span>
                    {' '}· founds a {STYLES[art.style].name} museum
                  </div>
                </div>
                <button onClick={() => onPick(id, offered)}>Inherit</button>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

/* ============================================================
   ONBOARDING — name the gallery + set ticket price
   ============================================================ */
function NameGallery({
  state, onConfirm,
}: {
  state: GameState;
  onConfirm: (playerName: string, galleryName: string, ticket: number) => void;
}) {
  const [playerName, setPlayerName] = useState('');
  const [galleryName, setGalleryName] = useState('');
  const [ticket, setTicket] = useState('8');
  const founding = STYLES[state.specialties[0]];

  return (
    <>
      <header>
        <h1>Museum Wars</h1>
        <span className="tagline">your first gallery</span>
      </header>
      <main>
        <div className="welcome">
          <h2>The Local Gallery is Yours</h2>
          <p>
            You have been granted a small rented gallery in the Historic
            District — a {founding.name} museum. Right now its walls are bare.
          </p>
          <p>
            Name your gallery (this is permanent), set an opening admission
            price (you can change the price later from the Manage tab), then
            begin filling those empty rooms.
          </p>
        </div>
        <div className="panel">
          <h2>Open Your Doors<span className="sub">name &amp; price</span></h2>
          <div className="field">
            <label>Your Name</label>
            <input value={playerName}
              placeholder="e.g. Eleanor Wynn"
              onChange={e => setPlayerName(e.target.value)} />
          </div>
          <div className="field">
            <label>Gallery Name</label>
            <input value={galleryName}
              placeholder="e.g. The Wynn Collection"
              onChange={e => setGalleryName(e.target.value)} />
          </div>
          <div className="field">
            <label>Opening Ticket Price (§)</label>
            <input value={ticket} inputMode="numeric"
              onChange={e => setTicket(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
          <p className="empty-note">
            A high price on an empty gallery draws no one. Start low while
            your collection is small.
          </p>
          <div className="divider" />
          <button className="big"
            disabled={!galleryName.trim()}
            onClick={() => onConfirm(playerName, galleryName,
              parseInt(ticket || '0', 10))}>
            Open the Gallery →
          </button>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   MAP TAB — your museums + the city's buildings
   ============================================================ */
function MapTab({
  state, apply, setState, flash, goGalleries,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
  setState: (s: GameState) => void;
  flash: (m: string) => void;
  goGalleries: () => void;
}) {
  const [selected, setSelected] = useState<string>(
    districtOfBuilding(E.activeMuseum(state).buildingId)?.id || 'historic');
  const [mapFailed, setMapFailed] = useState(false);
  // a building the player is about to open a new museum in
  const [openingBuilding, setOpeningBuilding] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const district = DISTRICTS.find(d => d.id === selected)!;

  // buildings already hosting one of the player's open museums
  const occupied = new Set(
    E.openMuseums(state).map(m => m.buildingId));

  // --- the "name your new museum" dialog --------------------
  if (openingBuilding) {
    const b = BUILDINGS[openingBuilding];
    return (
      <div className="panel">
        <h2>A New Museum<span className="sub">in the {b.name}</span></h2>
        <p className="empty-note">
          Opening a museum here costs {money(b.moveCost)} and adds
          {' '}{money(b.maintenance)}/week in upkeep. It starts empty — move
          works into it from your collection. Name your new museum:
        </p>
        <div className="field">
          <label>Museum name</label>
          <input value={newName} maxLength={40}
            placeholder="e.g. The Riverside Wing"
            onChange={e => setNewName(e.target.value)} />
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={state.funds < b.moveCost}
            onClick={() => {
              const r = E.openMuseumAt(state, openingBuilding, newName);
              if (r.error) { flash(r.error); return; }
              apply(r);
              setOpeningBuilding(null);
              setNewName('');
              goGalleries();
            }}>
            Open Museum · {money(b.moveCost)}
          </button>
          <button className="ghost"
            onClick={() => { setOpeningBuilding(null); setNewName(''); }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // --- the close-confirmation dialog ------------------------
  if (confirmClose) {
    const m = state.museums.find(mm => mm.id === confirmClose)!;
    return (
      <div className="panel">
        <h2>Close {m.name}?<span className="sub">this cannot be undone</span></h2>
        <p className="empty-note">
          Closing {m.name} stops its upkeep. Every work on its walls returns
          to your collection, unplaced. Any loans there end and are returned
          to their lenders — a returned loan cannot be hung again.
        </p>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost"
            onClick={() => {
              const r = E.closeMuseum(state, confirmClose);
              if (r.error) { flash(r.error); return; }
              apply(r);
              setConfirmClose(null);
            }}>
            Close This Museum
          </button>
          <button onClick={() => setConfirmClose(null)}>Keep It Open</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* the player's museums */}
      <div className="panel">
        <h2>Your Museums
          <span className="sub">{E.openMuseums(state).length} open</span></h2>
        <p className="empty-note">
          Each museum has its own building, fame and visitors. Switch to one
          to manage it; close one to save its upkeep.
        </p>
        <div className="divider" />
        {E.openMuseums(state).map(m => {
          const b = BUILDINGS[m.buildingId];
          const isActive = m.id === state.activeMuseumId;
          return (
            <div className="row" key={m.id}>
              <div className="meta">
                <div className="name">
                  {m.name}
                  {isActive && <span className="bld-tag here"> Viewing</span>}
                </div>
                <div className="info">
                  {b.name} · {m.fame} fame ·{' '}
                  {Math.round(E.computeVisitors(state, m))} visitors/wk
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!isActive && (
                  <button onClick={() => {
                    setState(E.switchMuseum(state, m.id));
                    goGalleries();
                  }}>
                    Manage
                  </button>
                )}
                {E.openMuseums(state).length > 1 && (
                  <button className="ghost"
                    onClick={() => setConfirmClose(m.id)}>
                    Close
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* the city map */}
      <div className="panel">
        <h2>The City<span className="sub">districts &amp; venues</span></h2>
        <p className="empty-note">
          Tap a district to see its venues. You can open a new museum in any
          venue you can afford — your collection is shared across them all.
        </p>
        <div className="divider" />
        <div className="citymap">
          {mapFailed ? (
            <div className="nomap">
              City map image not found — drop <b>map-city.png</b> into the
              project's <b>public/</b> folder. The markers below still work.
            </div>
          ) : (
            <img src={import.meta.env.BASE_URL + 'map-city.png'}
              alt="City map" onError={() => setMapFailed(true)} />
          )}
          {DISTRICTS.map(d => (
            <button key={d.id}
              className={'dist-btn'
                + (selected === d.id ? ' selected' : '')
                + (d.buildingIds.length === 0 ? ' empty' : '')}
              style={{ left: d.pos.x + '%', top: d.pos.y + '%', background: d.accent }}
              title={d.name}
              onClick={() => setSelected(d.id)} />
          ))}
          {DISTRICTS.filter(d => d.id === selected).map(d => (
            <div key={d.id} className="dist-label"
              style={{ left: d.pos.x + '%', top: d.pos.y + '%' }}>
              {d.name}
            </div>
          ))}
        </div>
      </div>

      <div className="district" style={{ borderLeftColor: district.accent }}>
        <div className="district-name">{district.name}</div>
        <div className="district-blurb">{district.blurb}</div>
        <div className="district-buildings">
          {district.buildingIds.length === 0 ? (
            <p className="empty-note" style={{ marginTop: 8 }}>
              No venues here yet — a future update will open this district.
            </p>
          ) : (
            district.buildingIds.map(bid => {
              const b = BUILDINGS[bid];
              const rooms = b.halls.reduce((s, h) => s + h.roomCap, 0);
              const here = occupied.has(bid);
              return (
                <div className="bld-row" key={bid}>
                  <div className="meta">
                    <div className="name">{b.name}</div>
                    <div className="info">
                      {b.blurb} · {rooms} rooms · upkeep {money(b.maintenance)}/wk
                    </div>
                  </div>
                  {here ? (
                    <span className="bld-tag here">A museum here</span>
                  ) : (
                    <button
                      disabled={state.funds < b.moveCost
                        || !!state.pendingItemId}
                      onClick={() => {
                        setNewName('');
                        setOpeningBuilding(bid);
                      }}>
                      Open · {money(b.moveCost)}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}


/* ============================================================
   GALLERIES TAB — cutaway interior with drag-drop slots
   ============================================================ */
const ROOM_TINT: Record<string, string> = {
  renaissance: '#3f4a31', egyptian: '#5e3526', asian: '#5a2e2a',
  classical: '#3a4654', medieval: '#3d3a2c', baroque: '#46322a',
  romanticism: '#3a3340', impressionism: '#3a4742', modernism: '#34404a',
  contemporary: '#3a3a3e', popculture: '#4a2f3e', precolumbian: '#4a3a26',
  islamic: '#2c4440',
};
function tintFor(style: StyleId) { return ROOM_TINT[style] || '#4a4030'; }

function GalleriesTab({
  state, apply, flash, setState, onArtifact,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
  flash: (m: string) => void;
  setState: (s: GameState) => void;
  onArtifact: (id: string) => void;
}) {
  const museum = E.activeMuseum(state);
  const building = BUILDINGS[museum.buildingId];
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [heldArt, setHeldArt] = useState<string | null>(null);
  const [sellArt, setSellArt] = useState<string | null>(null);
  // which wing of the active museum is being viewed, and the
  // wing-rename dialog target (a hallId, or null)
  const [selectedWing, setSelectedWing] = useState<string>(
    building.halls[0]?.id || '');
  const [renamingWing, setRenamingWing] = useState<string | null>(null);
  const [wingNameDraft, setWingNameDraft] = useState('');
  // if the active museum changed, snap the wing back to its first
  if (building.halls.length && !building.halls.some(h => h.id === selectedWing)) {
    setSelectedWing(building.halls[0].id);
  }

  const placedSet = new Set(museum.rooms.flatMap(r => r.items));
  const unplaced = state.owned.filter(id => !placedSet.has(id));
  if (state.pendingItemId && !unplaced.includes(state.pendingItemId))
    unplaced.unshift(state.pendingItemId);

  const placeInto = (dragId: string, roomId: number) => {
    // a loan is dragged as "loan:<loanId>"; owned art as the bare id
    if (dragId.startsWith('loan:')) {
      const loanId = dragId.slice(5);
      const r = E.placeLoan(state, loanId, roomId);
      if (r.error) flash(r.error); else apply(r);
      setHeldArt(null);
      return;
    }
    const art = ARTIFACT_BY_ID[dragId];
    const room = museum.rooms.find(r => r.id === roomId)!;
    if (!E.canPlace(room, art.style)) {
      flash(E.roomIsFull(room) ? 'That room is full.'
        : 'That room is themed to a different style.');
      return;
    }
    apply(E.placeArtifact({ ...state, pendingItemId: dragId }, roomId));
    setHeldArt(null);
  };
  // loans of the active museum not yet on display
  const pendingLoans = museum.loans.filter(l => l.roomId === null);

  const halls: Record<string, { name: string; rooms: Room[] }> = {};
  for (const r of museum.rooms)
    (halls[r.hallId] = halls[r.hallId] || { name: r.hallName, rooms: [] })
      .rooms.push(r);

  return (
    <>
      <div className="panel" style={{ paddingBottom: 8 }}>
        <h2>{museum.name}
          <span className="sub">
            {building.name} · {museum.fame} fame
          </span>
        </h2>
        {E.openMuseums(state).length > 1 && (
          <div className="museum-switch">
            {E.openMuseums(state).map(m => (
              <span key={m.id}
                className={'filter-chip'
                  + (m.id === state.activeMuseumId ? ' active' : '')}
                onClick={() => setState(E.switchMuseum(state, m.id))}>
                {m.name}
              </span>
            ))}
          </div>
        )}
        {unplaced.length > 0 && (
          <p className="drag-hint">
            Drag a work from your collection into a grey slot — or tap a work,
            then tap a slot. A room takes only works of its style.
          </p>
        )}
      </div>

      {/* wing switcher — show one wing at a time */}
      <div className="panel" style={{ paddingTop: 10, paddingBottom: 10 }}>
        <div className="wing-switch">
          {building.halls.map(h => {
            const wingRooms = museum.rooms.filter(r => r.hallId === h.id);
            const openRooms = wingRooms.filter(r => r.unlocked).length;
            const label = museum.wingNames[h.id] || h.name;
            return (
              <span key={h.id}
                className={'wing-chip'
                  + (selectedWing === h.id ? ' active' : '')}
                onClick={() => setSelectedWing(h.id)}>
                {label}
                <span className="wing-chip-sub">{openRooms}/{wingRooms.length}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* the selected wing */}
      {(() => {
        const hall = halls[selectedWing];
        if (!hall) return null;
        const cohesion = E.wingCohesionBonus(museum, selectedWing);
        return (
          <div className="gallery-frame">
            <div className="gallery-hall-label">
              <span>{museum.wingNames[selectedWing] || hall.name}</span>
              <button className="ghost small wing-rename-btn"
                onClick={() => {
                  setWingNameDraft(museum.wingNames[selectedWing] || '');
                  setRenamingWing(selectedWing);
                }}>
                Rename
              </button>
            </div>
            {cohesion > 0 && (
              <div className="wing-cohesion">
                Thematic wing — a cohesive style earns +{cohesion} fame
                {' '}toward this museum.
              </div>
            )}
            <div className="gallery-rooms">
              {hall.rooms.map(room => (
                <GalleryRoom key={room.id} state={state} room={room}
                  selected={selectedRoom === room.id}
                  heldArt={heldArt}
                  onSelect={() => setSelectedRoom(
                    selectedRoom === room.id ? null : room.id)}
                  onAssign={st => apply(E.assignRoom(state, room.id, st))}
                  onOpen={() => apply(E.openRoom(state))}
                  onDropArt={artId => placeInto(artId, room.id)}
                  onSlotClick={onArtifact}
                  onRemoveArt={artId => apply(E.removeArtifact(state, artId))} />
              ))}
            </div>
          </div>
        );
      })()}

      {renamingWing && (
        <div className="modal-backdrop" onClick={() => setRenamingWing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 20, marginBottom: 8 }}>Name this wing</h3>
            <p className="empty-note" style={{ marginBottom: 10 }}>
              Give the wing a name of your choosing. Leave it blank to restore
              its default name.
            </p>
            <div className="field">
              <input value={wingNameDraft} maxLength={32}
                placeholder={building.halls.find(h => h.id === renamingWing)?.name}
                onChange={e => setWingNameDraft(e.target.value)} />
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                setState(E.renameWing(state, museum.id, renamingWing,
                  wingNameDraft));
                setRenamingWing(null);
              }}>
                Save Name
              </button>
              <button className="ghost" onClick={() => setRenamingWing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="drawer">
        <h3>Your Private Collection</h3>
        {unplaced.length === 0 ? (
          <p className="empty-note">
            Every work you own is on display. Tap a work on a wall to move it
            back here; win more at auction from the Week tab.
          </p>
        ) : (
          <>
            <div className="drag-hint">
              {unplaced.length} work(s) held privately. Drag one onto a wall
              slot to display it — or tap a displayed work to bring it back here.
            </div>
            <div className="coll-strip">
              {unplaced.map(id => {
                const art = ARTIFACT_BY_ID[id];
                const band = rarityForScore(art.score);
                const ini = art.name.split(/\s+/)
                  .filter(w => /[A-Za-z]/.test(w))
                  .slice(0, 2).map(w => w[0].toUpperCase()).join('');
                const restoreOwed = state.restorationOwed[id];
                const declareOwed = state.stolenUndeclared[id];
                const isSalvage = state.salvageOnly.includes(id);
                const flagged = !!restoreOwed || !!declareOwed || isSalvage;
                return (
                  <div key={id}
                    className={'acq' + (heldArt === id ? ' selected' : '')
                      + (flagged ? ' unanalyzed' : '')}
                    draggable={!flagged}
                    onDragStart={e => {
                      if (flagged) { e.preventDefault(); return; }
                      e.dataTransfer.setData('text/plain', id);
                      setHeldArt(id);
                    }}
                    onClick={() => setHeldArt(heldArt === id ? null : id)}>
                    <div className="acq-img" style={{ background: band.hex }}>
                      {ini}
                    </div>
                    <div className="acq-body">
                      <div className="acq-name">{art.name}</div>
                      <div className="acq-sub">
                        {art.type} · {STYLES[art.style].name}
                      </div>
                      <div className="acq-foot">
                        <span className={'pill ' + band.cls}>{band.name}</span>
                        <span className="acq-meta">{art.year}</span>
                      </div>
                      {isSalvage && (
                        <div className="acq-unverified">
                          Forgery — cannot be exhibited
                        </div>
                      )}
                      {restoreOwed && (
                        <div className="acq-unverified">
                          Altered — restore before exhibiting
                        </div>
                      )}
                      {declareOwed && (
                        <div className="acq-unverified">
                          Stolen — must be declared
                        </div>
                      )}
                      {restoreOwed ? (
                        <button className="ghost small acq-sell"
                          onClick={e => {
                            e.stopPropagation();
                            apply(E.payRestoration(state, id));
                          }}>
                          Restore · {money(restoreOwed)}
                        </button>
                      ) : declareOwed ? (
                        <button className="ghost small acq-sell"
                          onClick={e => {
                            e.stopPropagation();
                            apply(E.declareStolen(state, id));
                          }}>
                          Report &amp; Declare · {money(declareOwed)}
                        </button>
                      ) : (
                        <button className="ghost small acq-sell"
                          onClick={e => { e.stopPropagation(); setSellArt(id); }}>
                          Sell…
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* loaned works — exhibit them like the private collection */}
      {museum.loans.length > 0 && (
        <div className="drawer">
          <h3>Loaned Items</h3>
          {pendingLoans.length === 0 ? (
            <p className="empty-note">
              Every loaned work is on display. A loan leaves when its term
              ends — you cannot hang it again once returned.
            </p>
          ) : (
            <>
              <div className="drag-hint">
                {pendingLoans.length} loaned work(s) waiting. Drag one onto a
                matching wall to exhibit it — a loan can be placed only once.
              </div>
              <div className="coll-strip">
                {pendingLoans.map(loan => {
                  const art = ARTIFACT_BY_ID[loan.artifactId];
                  const band = rarityForScore(art.score);
                  const ini = art.name.split(/\s+/)
                    .filter(w => /[A-Za-z]/.test(w))
                    .slice(0, 2).map(w => w[0].toUpperCase()).join('');
                  return (
                    <div key={loan.id} className="acq on-loan-card"
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('text/plain', 'loan:' + loan.id);
                        setHeldArt('loan:' + loan.id);
                      }}>
                      <div className="acq-img" style={{ background: band.hex }}>
                        {ini}
                      </div>
                      <div className="acq-body">
                        <div className="acq-name">{art.name}</div>
                        <div className="acq-sub">
                          {art.type} · {STYLES[art.style].name}
                        </div>
                        <div className="acq-foot">
                          <span className={'pill ' + band.cls}>{band.name}</span>
                          <span className="acq-meta">{loan.weeksLeft} wk left</span>
                        </div>
                        <div className="acq-loan-note">
                          On loan from {loan.lenderName} · {money(loan.weeklyFee)}/wk
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {sellArt && (
        <SellDialog
          artifact={ARTIFACT_BY_ID[sellArt]}
          onQuickSell={() => {
            apply(E.quickSellArtifact(state, sellArt));
            setSellArt(null);
          }}
          onAuctionSell={() => {
            apply(E.auctionSellArtifact(state, sellArt));
            setSellArt(null);
          }}
          onCancel={() => setSellArt(null)} />
      )}
    </>
  );
}

/* a small dialog to sell a work — quick sale at 70%, or consign
   to auction for a random 60-140% of value (centred near 100%). */
function SellDialog({
  artifact, onQuickSell, onAuctionSell, onCancel,
}: {
  artifact: typeof ARTIFACT_BY_ID[string];
  onQuickSell: () => void;
  onAuctionSell: () => void;
  onCancel: () => void;
}) {
  const quick = Math.round(artifact.value * 0.7);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 20, marginBottom: 2 }}>Sell {artifact.name}</h3>
        <p className="empty-note" style={{ marginBottom: 12 }}>
          Catalogue value {money(artifact.value)}. Choose how to part with it.
        </p>
        <div className="sell-option">
          <div>
            <div className="sell-opt-title">Quick private sale</div>
            <div className="sell-opt-note">
              A guaranteed {money(quick)} — 70% of value, paid at once.
            </div>
          </div>
          <button onClick={onQuickSell}>{money(quick)}</button>
        </div>
        <div className="sell-option">
          <div>
            <div className="sell-opt-title">Consign to auction</div>
            <div className="sell-opt-note">
              A gamble: the hammer falls anywhere from 60% to 140% of
              value, most often near {money(artifact.value)}.
            </div>
          </div>
          <button className="primary" onClick={onAuctionSell}>Consign</button>
        </div>
        <div className="divider" />
        <button className="ghost" onClick={onCancel}>Keep it</button>
      </div>
    </div>
  );
}

function GalleryRoom({
  state, room, selected, heldArt,
  onSelect, onAssign, onOpen, onDropArt, onSlotClick, onRemoveArt,
}: {
  state: GameState; room: Room; selected: boolean; heldArt: string | null;
  onSelect: () => void;
  onAssign: (s: StyleId) => void;
  onOpen: () => void;
  onDropArt: (artId: string) => void;
  onSlotClick: (artId: string) => void;
  onRemoveArt: (artId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  if (!room.unlocked) {
    return (
      <div className="groom locked">
        <div>Unbuilt Room</div>
        <button className="ghost small"
          disabled={state.funds < START.roomCost}
          onClick={onOpen}>
          Expand · {money(START.roomCost)}
        </button>
      </div>
    );
  }
  if (room.researching) {
    return (
      <div className="groom" style={{ ['--room-tint' as string]: '#4a3f2c' }}>
        <div className="groom-plaque" style={{ ['--plaque' as string]: '#3a2f1f' }}>
          <div className="pname">{STYLES[room.researching.style].name}</div>
          <div className="psub">Researching</div>
        </div>
        <div style={{ color: '#d8c9a6', fontSize: 11, fontStyle: 'italic',
          textAlign: 'center', margin: 'auto 0' }}>
          {room.researching.weeksLeft} week(s) left
        </div>
      </div>
    );
  }

  const theme = room.theme;
  const heldStyle = heldArt ? ARTIFACT_BY_ID[heldArt].style : null;
  const droppable = !!theme && heldStyle === theme && !E.roomIsFull(room);

  if (!theme) {
    return (
      <div className={'groom' + (selected ? ' selected' : '')}
        style={{ ['--room-tint' as string]: '#5b5340' }}>
        <div className="groom-plaque" style={{ ['--plaque' as string]: '#3a342a' }}
          onClick={onSelect}>
          <div className="pname">Open Room</div>
          <div className="psub">tap to assign</div>
        </div>
        {selected ? (
          <div className="groom-foot">
            {state.specialties.map(st => (
              <button key={st} className="assign-btn" onClick={() => onAssign(st)}>
                {STYLES[st].name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: '#d8c9a6', fontSize: 11, fontStyle: 'italic',
            textAlign: 'center', margin: 'auto 0' }}>
            Unassigned — tap the plaque to choose a style.
          </div>
        )}
      </div>
    );
  }

  // owned works first, then any loans exhibited in this room
  const loanIdsHere = E.activeMuseum(state).loans
    .filter(l => l.roomId === room.id)
    .map(l => l.artifactId);
  const filled = [...room.items, ...loanIdsHere];
  const slots: (string | null)[] = [];
  for (let i = 0; i < 5; i++) slots.push(filled[i] || null);
  const loanSet = new Set(loanIdsHere);

  return (
    <div
      className={'groom' + (selected ? ' selected' : '')
        + (dragOver && droppable ? ' droppable' : '')}
      style={{ ['--room-tint' as string]: tintFor(theme) }}
      onDragOver={e => { if (droppable) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDropArt(id);
      }}>
      <div className="groom-plaque"
        style={{ ['--plaque' as string]: '#2c2f24' }}
        onClick={onSelect}>
        <div className="pname">{STYLES[theme].name}</div>
        <div className="psub">{filled.length}/5 · room</div>
      </div>
      <div className="groom-slots">
        {slots.map((artId, i) => {
          if (!artId) {
            return (
              <div key={i}
                className={'slot' + (droppable && heldArt ? ' candrop' : '')}
                onClick={() => { if (heldArt && droppable) onDropArt(heldArt); }}>
                {droppable && heldArt ? 'drop' : ''}
              </div>
            );
          }
          const art = ARTIFACT_BY_ID[artId];
          const band = rarityForScore(art.score);
          const isLoan = loanSet.has(artId);
          const initials = art.name.split(/\s+/)
            .filter(w => /[A-Za-z]/.test(w))
            .slice(0, 2).map(w => w[0].toUpperCase()).join('');
          return (
            <div key={i} className={'slot filled' + (isLoan ? ' on-loan' : '')}
              style={{ ['--rar' as string]: band.hex }}
              title={`${art.name} — ${band.name} (score ${art.score})`
                + (isLoan ? ' · on loan' : '')}
              onClick={() => onSlotClick(artId)}>
              {!isLoan && (
                <button className="slot-remove"
                  title="Move to private collection"
                  onClick={e => { e.stopPropagation(); onRemoveArt(artId); }}>
                  ×
                </button>
              )}
              {isLoan && <span className="slot-loan-tag">loan</span>}
              <span className="slot-icon">{typeIcon(art.type)}</span>
              <span className="slot-initials">{initials}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   WEEK TAB
   ============================================================ */
function WeekTab({
  state, setState, flash, goGalleries, onNextWeek, onExpeditionResult, onGala,
  onBlackMarket,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  flash: (m: string) => void;
  goGalleries: () => void;
  onNextWeek: () => void;
  onExpeditionResult: (expeditionId: string) => void;
  onGala: () => void;
  onBlackMarket: () => void;
}) {
  if (state.activeEvent) {
    return <EventInterior state={state} setState={setState} flash={flash}
      goGalleries={goGalleries} />;
  }
  return (
    <div className="panel">
      <h2>Week {state.week}<span className="sub">the museum calendar</span></h2>
      {state.research && (
        <p className="empty-note">
          Research in progress: {STYLES[state.research.style].name} —
          {' '}{state.research.weeksLeft} week(s) remaining.
        </p>
      )}

      {/* expeditions that have returned and await their result */}
      {E.expeditionsReady(state).length > 0 && (
        <>
          <div className="divider" />
          <div className="filter-group-label">Expeditions Returned</div>
          {E.expeditionsReady(state).map(exp => {
            const def = EXPEDITION_TIERS.find(t => t.id === exp.tier)!;
            return (
              <div className="event-card" key={exp.id}>
                <div className="event-kind">Expedition</div>
                <div className="event-title">{def.name}</div>
                <div className="event-body">
                  Your team sought {STYLES[exp.style].name} and has reached
                  the site. Play out the dig to see what they uncover.
                </div>
                <div className="event-controls">
                  <button onClick={() => onExpeditionResult(exp.id)}>
                    Play Out the Dig
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* a society gala — court collectors for a loan */}
      {state.galaPending && (
        <>
          <div className="divider" />
          <div className="filter-group-label">Society</div>
          <div className="event-card">
            <div className="event-kind">Gala</div>
            <div className="event-title">A Society Gala</div>
            <div className="event-body">
              Collectors, aristocrats and patrons gather this week. Work the
              room, find a collection you covet, and persuade its owner to
              loan a piece to your museum.
            </div>
            <div className="event-controls">
              <button onClick={onGala}>Attend the Gala</button>
            </div>
          </div>
        </>
      )}

      {/* a black-market offer — a bargain, if it is genuine */}
      {state.blackMarketPending && (
        <>
          <div className="divider" />
          <div className="filter-group-label">A Discreet Word</div>
          <div className="event-card">
            <div className="event-kind">Black Market</div>
            <div className="event-title">An Unmarked Offer</div>
            <div className="event-body">
              A seller has surfaced with a piece priced far below its rarity.
              It could be a genuine bargain — or a forgery. Examine it before
              you decide.
            </div>
            <div className="event-controls">
              <button onClick={onBlackMarket}>Hear Them Out</button>
            </div>
          </div>
        </>
      )}

      {/* auction houses — join the ones your fame has opened */}
      <div className="divider" />
      <div className="filter-group-label">Auction Houses</div>
      {AUCTION_HOUSES.map(h => {
        const joined = state.joinedHouses.includes(h.id);
        const unlocked = E.totalFame(state) >= h.fameToUnlock;
        return (
          <div className="row" key={h.id}>
            <div className="meta">
              <div className="name">{h.name}</div>
              <div className="info">
                {h.blurb}
                {h.attendFee > 0 ? ` · ${money(h.attendFee)} per sale` : ' · free entry'}
              </div>
            </div>
            {joined ? (
              <span className="bld-tag here">Member</span>
            ) : !unlocked ? (
              <span className="bld-tag locked">{h.fameToUnlock} fame</span>
            ) : (
              <button disabled={state.funds < h.joinFee}
                onClick={() => {
                  const res = E.joinHouse(state, h.id);
                  if (res.error) { flash(res.error); return; }
                  setState(res.state);
                }}>
                Join · {money(h.joinFee)}
              </button>
            )}
          </div>
        );
      })}

      <div className="divider" />
      {state.events.length === 0 ? (
        <p className="empty-note">
          A quiet week — none of your auction houses are holding a sale.
        </p>
      ) : (
        <>
          <p className="empty-note">
            {state.events.length} sale{state.events.length === 1 ? '' : 's'}
            {' '}this week. Attend any you wish, in any order.
          </p>
          <div style={{ marginTop: 10 }}>
            {state.events.map(ev => (
              <EventCard key={ev.id} ev={ev} state={state}
                onAttend={() => {
                  const res = E.attendEvent(state, ev.id);
                  if (res.error) { flash(res.error); return; }
                  setState({
                    ...res.state,
                    auction: Auc.startLot(res.state,
                      res.state.activeEvent!.lotIds[0]),
                  });
                }} />
            ))}
          </div>
        </>
      )}
      <div className="divider" />
      <button className="big" onClick={onNextWeek}>Advance to Next Week →</button>
    </div>
  );
}

/* an auction event card with an expandable preview of its lots —
   you can see every lot's type, style and rarity before attending. */
function EventCard({
  ev, state, onAttend,
}: {
  ev: GameEvent; state: GameState; onAttend: () => void;
}) {
  const [showLots, setShowLots] = useState(false);
  return (
    <div className="event-card">
      <div className="event-kind">Auction</div>
      <div className="event-title">{ev.house}</div>
      <div className="event-body">
        {ev.lotIds.length} lots on offer — {ev.skewLabel}.
        {ev.fee > 0 ? ` Attendance fee ${money(ev.fee)}.` : ' Free to attend.'}
      </div>
      {showLots && (
        <div className="lot-preview">
          {ev.lotIds.map(id => {
            const art = ARTIFACT_BY_ID[id];
            const band = rarityForScore(art.score);
            return (
              <div className="lot-preview-row" key={id}>
                <span className="lot-preview-name">
                  {typeIcon(art.type)} {art.name}
                </span>
                <span className="lot-preview-meta">
                  {art.type} · {STYLES[art.style].name}
                </span>
                <span className={'pill ' + band.cls}>{band.name}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="event-controls">
        <button className="ghost" onClick={() => setShowLots(v => !v)}>
          {showLots ? 'Hide lots' : 'View lots'}
        </button>
        <button disabled={state.funds < ev.fee} onClick={onAttend}>
          Attend{ev.fee > 0 ? ` · ${money(ev.fee)}` : ''}
        </button>
      </div>
    </div>
  );
}

function EventInterior({
  state, setState, flash, goGalleries,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  flash: (m: string) => void;
  goGalleries: () => void;
}) {
  const ev = state.activeEvent!;
  const a = state.auction;

  // --- auction concluded -> "New items!" results screen --------
  if ((ev.lotIndex || 0) >= ev.lotIds.length) {
    const won = ev.acquired || [];
    return (
      <div className="panel auction-stage">
        <h2>{ev.house}<span className="sub">the sale has concluded</span></h2>
        {won.length === 0 ? (
          <p className="empty-note">
            You left the {ev.house} empty-handed this time.
          </p>
        ) : (
          <>
            <h3 style={{ marginTop: 4 }}>New Items — {won.length} acquired</h3>
            <p className="drag-hint">
              These works are now in your private collection. Place them on a
              wall from the Galleries tab whenever you wish.
            </p>
            <div className="results-grid">
              {won.map(id => <ItemCard key={id} artifact={ARTIFACT_BY_ID[id]} />)}
            </div>
          </>
        )}
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setState({ ...state, activeEvent: null })}>
            Return to the Week
          </button>
          {won.length > 0 && (
            <button className="ghost" onClick={goGalleries}>
              Go to the Galleries
            </button>
          )}
        </div>
      </div>
    );
  }
  // fail-safe: if the event is mid-lots but the auction object is
  // missing, rebuild it rather than rendering nothing (a blank
  // screen). This can never normally happen, but guarantees the
  // auction screen always shows something the player can act on.
  if (!a) {
    const recovered = Auc.startLot(state, ev.lotIds[ev.lotIndex || 0]);
    queueMicrotask(() => setState({ ...state, auction: recovered }));
    return (
      <div className="panel auction-stage">
        <h2>{ev.house}<span className="sub">preparing the next lot…</span></h2>
      </div>
    );
  }
  const art = ARTIFACT_BY_ID[ev.lotIds[ev.lotIndex || 0]];
  const isLast = (ev.lotIndex || 0) >= ev.lotIds.length - 1;
  const myNext = a.currentBid + a.increment;
  const lotNum = Math.min((ev.lotIndex || 0) + 1, ev.lotIds.length);

  const onBegin = () => {
    setState({ ...state, auction: Auc.beginAuction(a) });
  };
  const onBid = () => {
    const res = Auc.playerBid(state);
    if (res.error) { flash(res.error); return; }
    setState({ ...state, auction: res.auction });
  };
  const onContinue = () => {
    const after = E.finishLot(state);
    if ((after.activeEvent!.lotIndex || 0) < after.activeEvent!.lotIds.length) {
      setState({
        ...after,
        auction: Auc.startLot(after,
          after.activeEvent!.lotIds[after.activeEvent!.lotIndex!]),
      });
    } else {
      setState({ ...after, auction: null });
    }
  };
  // passing a lot must ALSO start the next lot's auction, or the
  // stage would render with auction === null (a blank screen).
  const onPass = () => {
    const after = E.passLot(state);
    if ((after.activeEvent!.lotIndex || 0) < after.activeEvent!.lotIds.length) {
      setState({
        ...after,
        auction: Auc.startLot(after,
          after.activeEvent!.lotIds[after.activeEvent!.lotIndex!]),
      });
    } else {
      setState({ ...after, auction: null });
    }
  };

  // can the player bid right now? (allowed in announcing + counting,
  // never in intro, never when already leading or beyond funds)
  const canBid = !a.over && a.mode !== 'intro'
    && a.leader !== 'player' && myNext <= state.funds;
  const bidLabel = a.leader === 'player' ? 'You lead'
    : myNext > state.funds ? 'Beyond funds'
    : `Bid ${money(myNext)}`;

  // the big centre display: intro / a count number / SOLD
  let display: React.ReactNode;
  if (a.mode === 'intro') display = <span className="au-ready">Ready</span>;
  else if (a.over) display = <span className="au-sold">SOLD</span>;
  else if (a.mode === 'announcing') display = <span className="au-dash">— —</span>;
  else display = <span className="au-count">{a.count}</span>;

  return (
    <div className="panel auction-stage">
      <h2>{ev.house}
        <span className="sub">lot {lotNum} of {ev.lotIds.length}</span>
      </h2>
      <div className="lot-tracker">Lots won so far: {ev.acquired?.length || 0}</div>
      <div className="auction-art">
        <Thumb artifact={art} size="lg" />
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20 }}>
          {art.name}
        </div>
        <div className="bid-line">
          {art.type} · {STYLES[art.style].name} · {art.year}
        </div>
        <div className="bid-line">est. {money(a.estimate)}</div>
        <div><RarityPill score={art.score} /></div>
      </div>
      <div className="divider" />

      {a.mode === 'intro' ? (
        /* paused — present the lot, wait for Begin */
        <>
          <div className="au-stage-msg">{a.message}</div>
          <div className="bid-readout">opening at {money(a.currentBid)}</div>
          <button className="primary big au-begin" onClick={onBegin}>
            Begin Auction
          </button>
        </>
      ) : (
        <>
          <div className={'au-clock' + (a.over ? ' done' : '')}>{display}</div>
          <div className="bid-line">
            {a.leader === 'player' ? 'You hold the leading bid'
              : a.leader === 'rival' ? 'A rival holds the leading bid'
              : 'The floor is open'}
          </div>
          <div className="bid-readout">{money(a.currentBid)}</div>
          <div className="rival-tag">{a.message}</div>

          {/* bid controls — FIXED positions; they grey out, never move */}
          <div className="bid-controls">
            <button disabled={!canBid} onClick={onBid}>{bidLabel}</button>
            <button className="ghost" disabled={a.over}
              onClick={onPass}>
              Pass this lot
            </button>
          </div>

          {/* the lot-sold pause: continue only appears once over */}
          {a.over && (
            <div className="au-sold-bar">
              <div className="au-sold-line">
                {a.won
                  ? `You won ${art.name}.`
                  : `${art.name} went to ${a.leader === 'rival' ? 'a rival' : 'no one'}.`}
              </div>
              <button className="primary" onClick={onContinue}>
                {isLast ? 'See Results' : 'Next Lot →'}
              </button>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <button className="ghost small"
          onClick={() => setState(E.leaveAuction(state))}>
          Leave the auction
        </button>
      </div>
    </div>
  );
}

/* a detail card for a won/found item — used on results screens */
function ItemCard({ artifact }: { artifact: typeof ARTIFACT_BY_ID[string] }) {
  const band = rarityForScore(artifact.score);
  return (
    <div className="item-card" style={{ borderTopColor: band.hex }}>
      <div className="item-card-head">
        <Thumb artifact={artifact} size="sm" />
        <div>
          <div className="item-card-name">{artifact.name}</div>
          <div className="item-card-sub">
            {artifact.type} · {STYLES[artifact.style].name}
          </div>
        </div>
      </div>
      <div className="item-card-desc">{artifact.description}</div>
      <div className="item-card-foot">
        <span className={'pill ' + band.cls}>{band.name}</span>
        <span className="item-card-meta">{artifact.year}</span>
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALTIES (STYLES) TAB
   ============================================================ */
function SpecialtiesTab({
  state, apply,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const tier = E.researchTier(state);
  const chk = E.canResearch(state);
  return (
    <div className="panel">
      <h2>Styles<span className="sub">the traditions you master</span></h2>
      {state.specialties.map(st => (
        <div className="row" key={st}>
          <div className="meta">
            <div className="name">{STYLES[st].name}</div>
            <div className="info">
              Events of this style come to your museum each week.
            </div>
          </div>
          <div className="stars">{stars(state.expertise[st] || 0)}</div>
        </div>
      ))}
      <div className="divider" />
      {state.research ? (
        <div className="row">
          <div className="meta">
            <div className="name">
              Researching: {STYLES[state.research.style].name}
            </div>
            <div className="info">
              {state.research.weeksLeft} week(s) remaining. A room is reserved.
            </div>
          </div>
        </div>
      ) : !tier ? (
        <p className="empty-note">Every style has been mastered.</p>
      ) : (
        <>
          <div className="row">
            <div className="meta">
              <div className="name">Research a New Style</div>
              <div className="info">
                Requires {tier.fameReq} fame, a {money(tier.fee)} fee, and an
                open unassigned room. Takes 3–4 weeks.
              </div>
            </div>
          </div>
          {!chk.ok && <p className="empty-note">{chk.reason}</p>}
          {STYLE_IDS.filter(s => !state.specialties.includes(s)).map(sid => (
            <div className="row" key={sid}>
              <div className="meta">
                <div className="name">{STYLES[sid].name}</div>
              </div>
              <button disabled={!chk.ok}
                onClick={() => apply(E.startResearch(state, sid))}>
                Research
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================================================
   MANAGE TAB — ticket price, advertising, sponsors
   ============================================================ */
function ManageTab({
  state, setState, apply,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const [sub, setSub] = useState<'business' | 'expeditions' | 'personnel'>('business');
  return (
    <>
      <div className="panel" style={{ paddingBottom: 10 }}>
        <h2>Manage<span className="sub">the running of your museum</span></h2>
        <div className="rank-toggle" style={{ marginBottom: 0 }}>
          {([
            ['business', 'Business'],
            ['expeditions', 'Expeditions'],
            ['personnel', 'Personnel'],
          ] as const).map(([id, label]) => (
            <div key={id}
              className={'filter-chip' + (sub === id ? ' active' : '')}
              onClick={() => setSub(id)}>{label}</div>
          ))}
        </div>
      </div>
      {sub === 'business' && (
        <BusinessTab state={state} setState={setState} apply={apply} />
      )}
      {sub === 'expeditions' && (
        <ExpeditionsTab state={state} apply={apply} />
      )}
      {sub === 'personnel' && (
        <PersonnelTab state={state} apply={apply} />
      )}
    </>
  );
}

/* ============================================================
   PERSONNEL TAB — hired staff + recruits to hire
   ============================================================ */
/** find the label + effect text for a staff member's specialty */
function specInfo(m: { role: string; specialty: string }) {
  const list = E.STAFF_SPECIALTIES[m.role as 'curator' | 'researcher' | 'explorer'];
  return list.find(x => x.id === m.specialty)
    || { label: E.ROLE_NAME[m.role as 'curator'], effect: '' };
}

function PersonnelTab({
  state, apply,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const wages = E.weeklyWages(state);
  return (
    <>
      <div className="panel">
        <h2>Your Staff<span className="sub">personnel on the payroll</span></h2>
        {state.staff.length === 0 ? (
          <p className="empty-note">
            No one is on the payroll yet. Hire from the recruits below — a
            Researcher is needed before you can research a new style.
          </p>
        ) : (
          <>
            <p className="empty-note">
              Total wages: {money(wages)} per week.
            </p>
            {state.staff.map(m => (
              <div className="row" key={m.id}>
                <div className="meta">
                  <div className="name">
                    {m.name}
                    {' '}<span className="tier-tag">{specInfo(m).label}</span>
                  </div>
                  <div className="info">
                    {'★'.repeat(m.skill)}{'☆'.repeat(3 - m.skill)} ·
                    {' '}{money(m.wage)}/week — {specInfo(m).effect}
                  </div>
                </div>
                <button className="ghost"
                  onClick={() => apply(E.dismissStaff(state, m.id))}>
                  Dismiss
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Recruits<span className="sub">available to hire</span></h2>
        <p className="empty-note">
          Hiring takes a signing fee of four weeks' wage; the wage then
          recurs each week. New recruits appear every few weeks.
        </p>
        {state.candidates.length === 0 ? (
          <p className="empty-note">No recruits are seeking work just now.</p>
        ) : (
          state.candidates.map(c => {
            const signingFee = c.wage * 4;
            return (
              <div className="row" key={c.id}>
                <div className="meta">
                  <div className="name">
                    {c.name}
                    {' '}<span className="tier-tag">{specInfo(c).label}</span>
                  </div>
                  <div className="info">
                    {'★'.repeat(c.skill)}{'☆'.repeat(3 - c.skill)} ·
                    {' '}{money(c.wage)}/week · signing fee {money(signingFee)}
                  </div>
                  <div className="info">{specInfo(c).effect}</div>
                </div>
                <button disabled={state.funds < signingFee}
                  onClick={() => apply(E.hireStaff(state, c.id))}>
                  Hire
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/* ============================================================
   EXPEDITION RESULT — a memory match mini-game
   Each found work appears on TWO cards (its initials over a
   rarity-coloured back). One 3-second reveal, then three
   attempts to match a pair. Each matched pair wins that work.
   ============================================================ */

/* ============================================================
   EXPEDITION DIG BOARD — the mini-game
   ============================================================ */
function ExpeditionGame({
  state, expedition, onFinish,
}: {
  state: GameState;
  expedition: Expedition;
  onFinish: (result: { objectIds?: string[]; shardsWon?: number }) => void;
}) {
  const def = EXPEDITION_TIERS.find(t => t.id === expedition.tier)!;
  // explorer staff bonuses: a surveyor grants extra digs, a
  // veteran raises hazard tolerance.
  const bonusDigs = E.specialtySkill(state, 'surveyor');
  const bonusTolerance = E.specialtySkill(state, 'veteran') >= 2 ? 1 : 0;
  const [board, setBoard] = useState<Dig.DigBoard>(
    () => Dig.makeBoard(def, bonusDigs, bonusTolerance));
  const [started, setStarted] = useState(false);

  // finish: turn the board result into artifact ids / shard count
  const collect = () => {
    const res = Dig.boardResult(board);
    if (def.yieldsObjects) {
      // roll that many real works of the right band+style — never a
      // work the player already owns, or resolveExpedition drops it
      const ids: string[] = [];
      const owned = new Set<string>(state.owned);
      const band = def.id === 'common' ? 'common' : 'uncommon';
      for (let i = 0; i < res.artifacts; i++) {
        const pool = ARTIFACTS.filter(a =>
          a.style === expedition.style && !owned.has(a.id)
          && (band === 'common' ? a.score < 10 : a.score >= 10 && a.score < 20));
        const fallback = ARTIFACTS.filter(a => !owned.has(a.id)
          && (band === 'common' ? a.score < 10 : a.score >= 10 && a.score < 20));
        const use = pool.length ? pool : fallback;
        if (use.length) {
          const pick = use[Math.floor(Math.random() * use.length)];
          ids.push(pick.id); owned.add(pick.id);
        }
      }
      onFinish({ objectIds: ids });
    } else {
      onFinish({ shardsWon: res.shards });
    }
  };

  // --- intro -------------------------------------------------
  if (!started) {
    return (
      <div className="panel">
        <h2>{def.name}
          <span className="sub">{STYLES[expedition.style].name} · the dig</span></h2>
        <p className="empty-note">
          Your team has reached the site. Reveal tiles to dig — a
          {' '}<b>clue</b> means a find sits next to it, a <b>danger</b> mark
          means a hazard does. You have <b>{def.digs} digs</b>.
          {def.bombTolerance === 1
            ? ' A single hazard ends the expedition with nothing.'
            : ` Hit ${def.bombTolerance} hazards and the expedition collapses.`}
          {' '}You may stop and bank your findings at any time.
        </p>
        <p className="empty-note">
          {def.yieldsObjects
            ? `This dig can turn up whole ${STYLES[expedition.style].name} works.`
            : `This dig yields ${def.id} shards — bank enough to summon a `
              + `${def.id} work.`}
        </p>
        <div className="divider" />
        <button onClick={() => setStarted(true)}>Begin the Dig</button>
      </div>
    );
  }

  // --- done --------------------------------------------------
  if (board.finished) {
    const res = Dig.boardResult(board);
    const gotSomething = res.artifacts > 0 || res.shards > 0;
    return (
      <div className="panel">
        <h2>{board.ejected ? 'Expedition Lost' : 'Expedition Complete'}
          <span className="sub">
            {board.ejected ? 'the site claimed everything'
              : gotSomething ? 'findings secured' : 'nothing found'}
          </span>
        </h2>
        {board.ejected ? (
          <p className="empty-note">
            One hazard too many — the dig collapsed and the team escaped with
            nothing. The findings are lost.
          </p>
        ) : def.yieldsObjects ? (
          <p className="empty-note">
            The team brings home {res.artifacts} whole work(s) for the
            collection.{res.shards > 0 && ' Loose shards were left behind.'}
          </p>
        ) : (
          <p className="empty-note">
            The team banked <b>{res.shards} {def.id} shard(s)</b> of
            {' '}{STYLES[expedition.style].name}. Collect {SUMMON_COST[def.id as 'rare' | 'epic']}
            {' '}to summon a work.
          </p>
        )}
        <div className="divider" />
        <button onClick={collect}>Collect &amp; Continue</button>
      </div>
    );
  }

  // --- the board ---------------------------------------------
  return (
    <div className="panel">
      <h2>{def.name}
        <span className="sub">{board.digsLeft} dig(s) left</span></h2>
      <div className="dig-status">
        <span>Hazards hit: {board.bombsHit}/{board.bombTolerance}</span>
        {def.yieldsObjects
          ? <span>Works found: {board.artifactsFound}</span>
          : <span>Shards banked: {board.shardsBanked}</span>}
      </div>
      <div className={'dig-grid size-' + board.size}>
        {board.tiles.map((tile, i) => {
          const out = !tile.revealed;
          let face = '';
          let cls = 'dig-tile';
          if (tile.revealed) {
            cls += ' open';
            if (tile.kind === 'bomb') { face = '✸'; cls += ' bomb'; }
            else if (tile.kind === 'danger') { face = '⚠'; cls += ' danger'; }
            else if (tile.kind === 'clue') { face = '◆'; cls += ' clue'; }
            else if (tile.kind === 'find') {
              face = tile.findKind === 'artifact' ? '★' : '◈';
              cls += ' find';
            } else { cls += ' empty'; }
          }
          return (
            <button key={i} className={cls}
              disabled={tile.revealed || board.digsLeft <= 0}
              onClick={() => setBoard(Dig.revealTile(board, i))}>
              {out ? '' : face}
            </button>
          );
        })}
      </div>
      <div className="dig-legend">
        <span>◆ clue — a find is adjacent</span>
        <span>⚠ danger — a hazard is adjacent</span>
        <span>★◈ find</span>
        <span>✸ hazard</span>
      </div>
      <div className="divider" />
      <button className="ghost" onClick={() => setBoard(Dig.bankBoard(board))}>
        Stop &amp; Bank Findings
      </button>
    </div>
  );
}

/* ============================================================
   EXPEDITIONS TAB — commission, track, summon
   ============================================================ */
function ExpeditionsTab({
  state, apply,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const active = E.expeditionsActive(state);
  const ready = E.expeditionsReady(state);
  const freeExplorers = E.freeExplorers(state);

  const [tier, setTier] = useState<string>(EXPEDITION_TIERS[0].id);
  const [style, setStyle] = useState<string>(state.specialties[0] || '');
  const [leaderId, setLeaderId] = useState<string>('');

  const tierDef = EXPEDITION_TIERS.find(t => t.id === tier)!;
  const canCommission = !!style && state.funds >= tierDef.cost;

  // shard holdings, grouped for the summoning panel
  const shardRows: { tier: 'rare' | 'epic'; style: StyleId; have: number }[] = [];
  for (const key of Object.keys(state.shards)) {
    const have = state.shards[key];
    if (have <= 0) continue;
    const [t, st] = key.split(':') as ['rare' | 'epic', StyleId];
    shardRows.push({ tier: t, style: st, have });
  }

  return (
    <>
      {ready.length > 0 && (
        <div className="panel">
          <h2>Returned<span className="sub">ready to play out</span></h2>
          <p className="empty-note">
            {ready.length} expedition(s) have returned — play out the dig from
            the Week tab.
          </p>
        </div>
      )}

      {/* summoning */}
      <div className="panel">
        <h2>Summoning<span className="sub">spend shards on a work</span></h2>
        {shardRows.length === 0 ? (
          <p className="empty-note">
            No shards yet. Rare and Epic expeditions bank shards; collect
            enough of one style to summon a work.
          </p>
        ) : (
          shardRows.map(row => {
            const cost = SUMMON_COST[row.tier];
            const ready2 = row.have >= cost;
            return (
              <div className="row" key={row.tier + row.style}>
                <div className="meta">
                  <div className="name">
                    {row.tier === 'rare' ? 'Rare' : 'Epic'} ·
                    {' '}{STYLES[row.style].name}
                  </div>
                  <div className="info">
                    {row.have} / {cost} shards
                    {ready2 ? ' — ready to summon' : ' — keep digging'}
                  </div>
                </div>
                <button disabled={!ready2}
                  onClick={() => apply(E.summonArtifact(state, row.tier, row.style))}>
                  Summon
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* active expeditions */}
      <div className="panel">
        <h2>In Progress<span className="sub">{active.length} underway</span></h2>
        {active.length === 0 ? (
          <p className="empty-note">No expeditions are underway.</p>
        ) : (
          active.map(e => {
            const d = EXPEDITION_TIERS.find(t => t.id === e.tier)!;
            const ldr = e.leaderId
              ? state.staff.find(m => m.id === e.leaderId) : null;
            return (
              <div className="row" key={e.id}>
                <div className="meta">
                  <div className="name">{d.name}</div>
                  <div className="info">
                    Seeking {STYLES[e.style].name}
                    {ldr ? ` · led by ${ldr.name}` : ''}
                  </div>
                </div>
                <span className="bld-tag locked">
                  {e.weeksLeft} wk{e.weeksLeft === 1 ? '' : 's'} left
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* commission */}
      <div className="panel">
        <h2>Commission an Expedition
          <span className="sub">send a team into the field</span></h2>

        <div className="filter-group-label">Tier</div>
        <div className="filter-bar">
          {EXPEDITION_TIERS.map(t => (
            <span key={t.id}
              className={'filter-chip' + (tier === t.id ? ' active' : '')}
              onClick={() => setTier(t.id)}>
              {t.name}
            </span>
          ))}
        </div>
        <p className="empty-note">{tierDef.blurb}</p>
        <p className="empty-note">
          Cost {money(tierDef.cost)} · {tierDef.gridSize}×{tierDef.gridSize} board ·
          {' '}{tierDef.digs} digs · {tierDef.bombs} hazard(s),
          {' '}{tierDef.bombTolerance === 1 ? 'one ends it' : `tolerate ${tierDef.bombTolerance}`}.
        </p>

        <div className="filter-group-label">Style sought</div>
        {state.specialties.length === 0 ? (
          <p className="empty-note">Research a style first.</p>
        ) : (
          <div className="filter-bar">
            {state.specialties.map(st => (
              <span key={st}
                className={'filter-chip' + (style === st ? ' active' : '')}
                onClick={() => setStyle(st)}>
                {STYLES[st].name}
              </span>
            ))}
          </div>
        )}

        <div className="filter-group-label">Leader (optional)</div>
        <div className="filter-bar">
          <span className={'filter-chip' + (leaderId === '' ? ' active' : '')}
            onClick={() => setLeaderId('')}>
            No leader
          </span>
          {freeExplorers.map(m => (
            <span key={m.id}
              className={'filter-chip' + (leaderId === m.id ? ' active' : '')}
              onClick={() => setLeaderId(m.id)}>
              {m.name} {'★'.repeat(m.skill)}
            </span>
          ))}
        </div>

        <div className="divider" />
        <button disabled={!canCommission}
          onClick={() => {
            apply(E.commissionExpedition(state, tier as never,
              style as never, leaderId || null));
          }}>
          Commission · {money(tierDef.cost)}
        </button>
      </div>
    </>
  );
}


/* ============================================================
   BLACK MARKET SCREEN — a bargain, if it is genuine
   ============================================================ */
function BlackMarketScreen({
  state, onBuy, onClose,
}: {
  state: GameState;
  onBuy: (artId: string, outcome: BM.PurchaseOutcome) => void;
  onClose: () => void;
}) {
  const [offer] = useState<BM.BlackMarketOffer>(
    () => BM.makeBlackMarketOffer(state.specialties));
  const [results, setResults] = useState<BM.ActionResult[]>([]);
  const [patience, setPatience] = useState(offer.patience);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [guess, setGuess] = useState<BM.Verdict | ''>('');
  const [phase, setPhase] = useState<'intro' | 'research' | 'done'>('intro');
  const [askPrice, setAskPrice] = useState(offer.ask);
  const [dealerLine, setDealerLine] = useState('');
  const [guessedRight, setGuessedRight] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<BM.PurchaseOutcome | null>(null);

  const art = ARTIFACT_BY_ID[offer.artifactId];
  const turnsLeft = offer.researchTurns - turnsUsed;
  const canResearch = turnsLeft > 0 && patience > 0;

  const dealerReactions = [
    'The dealer drums his fingers. "Another buyer is interested, you know."',
    '"I have not got all evening," he mutters, glancing at the door.',
    '"Test it all you like. The price does not improve with waiting."',
    'He lights a cigarette. "Cash today, or not at all."',
    '"One more look. Then you decide — yes or no."',
  ];

  const doAction = (actionId: string) => {
    const def = BM.ACTIONS.find(a => a.id === actionId)!;
    if (!canResearch) return;
    if (state.funds < def.cost) return;
    const res = BM.runAction(offer, actionId);
    setResults(r => [...r, res]);
    setTurnsUsed(n => n + 1);
    const newPat = patience - 1;
    setPatience(newPat);
    setDealerLine(newPat <= 0
      ? '"Enough. Decide now — I am done waiting."'
      : dealerReactions[Math.floor(Math.random() * dealerReactions.length)]);
  };

  const resolveGuess = (asStolen: boolean) => {
    const right = guess === offer.verdict;
    setGuessedRight(right);
    const o = BM.purchaseOutcome(offer,
      asStolen && offer.verdict === 'stolen' ? offer.stolenPrice : askPrice);
    setOutcome(o);
    setPhase('done');
  };

  const negotiate = () => {
    // haggle: the dealer may cut the ask, or refuse and lose patience
    if (Math.random() < 0.55) {
      const cut = Math.round(askPrice * (0.1 + Math.random() * 0.15));
      setAskPrice(p => Math.max(1, p - cut));
      setDealerLine(`"...Fine. ${money(cut)} off. Not a penny more."`);
    } else {
      setPatience(p => Math.max(0, p - 1));
      setDealerLine('"My price is my price." He looks annoyed.');
    }
  };

  // --- intro ---------------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="panel">
        <h2>A Discreet Offer<span className="sub">the black market</span></h2>
        <div className="auction-art">
          <div className="auction-art-icon">{typeIcon(art.type)}</div>
        </div>
        <h3 style={{ fontSize: 22, margin: '10px 0 2px' }}>{art.name}</h3>
        <p className="empty-note">
          The dealer claims a {STYLES[offer.claimedStyle].name} piece — "{art.type},
          and no questions asked." He wants {money(offer.ask)}. It could be a
          genuine bargain, a clever fake, or something that ought not be sold
          at all.
        </p>
        <p className="empty-note">
          You may run {offer.researchTurns} research actions before deciding.
          Each costs money and tries the dealer's patience — push too far and
          he walks. From the evidence, name the one verdict that fits.
        </p>
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setPhase('research')}>Examine the Piece</button>
          <button className="ghost" onClick={onClose}>Walk Away</button>
        </div>
      </div>
    );
  }

  // --- done ----------------------------------------------------
  if (phase === 'done' && outcome) {
    const vdef = BM.VERDICTS.find(v => v.id === outcome.verdict)!;
    return (
      <div className="panel">
        <h2>The Deal<span className="sub">{art.name}</span></h2>
        {guessedRight !== null && (
          <p className={'bm-callout ' + (guessedRight ? 'right' : 'wrong')}>
            {guessedRight
              ? 'Your deduction was correct.'
              : '"That is not what this is," the dealer says flatly. You were wrong.'}
          </p>
        )}
        <div className="bm-verdict-box">
          <div className="bm-verdict-title">{vdef.label}</div>
          <div className="bm-verdict-blurb">{vdef.blurb}</div>
        </div>
        <div className="divider" />
        <div className="bm-money">
          <div><span>True value</span><b>{money(offer.originalValue)}</b></div>
          <div><span>You paid</span><b>{money(outcome.pricePaid)}</b></div>
          {outcome.restorationFee > 0 && (
            <div><span>Restoration owed</span>
              <b>{money(outcome.restorationFee)}</b></div>
          )}
          {outcome.declareFee > 0 && (
            <div><span>Declaration owed</span>
              <b>{money(outcome.declareFee)}</b></div>
          )}
          <div><span>Worth to you</span>
            <b>{money(outcome.effectiveValue)}</b></div>
        </div>
        {outcome.salvageOnly && (
          <p className="empty-note" style={{ color: 'var(--rare-icon)' }}>
            This piece cannot be exhibited. It will sit in your collection as
            salvage — sell it from a gallery to recover what little it is worth.
          </p>
        )}
        <div className="divider" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { onBuy(offer.artifactId, outcome); onClose(); }}>
            Take the Deal · {money(outcome.pricePaid)}
          </button>
          <button className="ghost" onClick={onClose}>Decline &amp; Leave</button>
        </div>
      </div>
    );
  }

  // --- research ------------------------------------------------
  const colourMark = (c: BM.FeedbackColour) =>
    c === 'green' ? '🟩' : c === 'yellow' ? '🟨'
      : c === 'red' ? '🟥' : '⬛';

  return (
    <div className="panel">
      <h2>Authenticate<span className="sub">{art.name}</span></h2>
      <div className="bm-head">
        <div><span>Claimed</span><b>{STYLES[offer.claimedStyle].name} {art.type}</b></div>
        <div><span>Asking</span><b>{money(askPrice)}</b></div>
        <div><span>Turns left</span><b>{turnsLeft}</b></div>
        <div><span>Dealer patience</span>
          <b>{'●'.repeat(patience)}{'○'.repeat(Math.max(0, offer.patience - patience))}</b></div>
      </div>

      {dealerLine && <p className="bm-dealer">{dealerLine}</p>}

      {/* evidence grid — actions as rows, 4 categories as columns */}
      <div className="bm-grid">
        <div className="bm-grid-head">
          <span>Research</span>
          {BM.CATEGORIES.map(c => (
            <span key={c} title={BM.CATEGORY_LABEL[c]}>
              {BM.CATEGORY_LABEL[c].split(' ')[0]}
            </span>
          ))}
        </div>
        {results.length === 0 && (
          <div className="bm-grid-empty">
            No research yet — run an action below.
          </div>
        )}
        {results.map((r, i) => {
          const def = BM.ACTIONS.find(a => a.id === r.actionId)!;
          return (
            <div className="bm-grid-row" key={i}>
              <span className="bm-action-name">{def.label}</span>
              {BM.CATEGORIES.map(c => (
                <span key={c} className="bm-cell">{colourMark(r.colours[c])}</span>
              ))}
            </div>
          );
        })}
      </div>

      {/* research actions */}
      {canResearch ? (
        <>
          <div className="filter-group-label">Research actions</div>
          <div className="bm-actions">
            {BM.ACTIONS.map(a => (
              <button key={a.id} className="bm-action-btn"
                disabled={state.funds < a.cost}
                title={a.blurb}
                onClick={() => doAction(a.id)}>
                {a.label}<span className="bm-action-cost">{money(a.cost)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-note">
          {patience <= 0
            ? 'The dealer is out of patience — decide now.'
            : 'No research turns left — make your decision.'}
        </p>
      )}

      <div className="divider" />

      {/* the deduction */}
      <div className="filter-group-label">Your verdict</div>
      <p className="empty-note">
        Name the single verdict the evidence points to. Guess right and the
        deal resolves on fair terms; guess wrong and you buy blind.
      </p>
      <select className="bm-select" value={guess}
        onChange={e => setGuess(e.target.value as BM.Verdict)}>
        <option value="">— choose a verdict —</option>
        {BM.VERDICTS.map(v => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>

      <div className="bm-decide">
        <button disabled={!guess} onClick={() => resolveGuess(true)}>
          Buy on This Verdict
        </button>
        <button className="ghost" onClick={negotiate}
          disabled={patience <= 0}>
          Negotiate Price
        </button>
        <button className="ghost" onClick={onClose}>Pass</button>
      </div>
    </div>
  );
}


/* ============================================================
   GALA SCREEN — meet guests, inspect collections, persuade
   ============================================================ */
function GalaScreen({
  state, onAccept, onClose,
}: {
  state: GameState;
  onAccept: (artId: string, weeks: number, fee: number, lender: string) => void;
  onClose: () => void;
}) {
  // guests are generated once when the gala opens
  const [guests] = useState<Gala.Guest[]>(
    () => Gala.makeGuests(state.specialties));
  const [viewing, setViewing] = useState<Gala.Guest | null>(null);
  const [convo, setConvo] = useState<Gala.Conversation | null>(null);
  const [outcome, setOutcome] = useState<Gala.GalaOutcome | null>(null);
  const [done, setDone] = useState(false);

  // --- conversation outcome screen --------------------------
  if (outcome) {
    return (
      <div className="panel">
        <h2>{outcome.success ? 'A Loan Secured' : 'Politely Declined'}
          <span className="sub">the conversation ends</span></h2>
        <p className="empty-note">{outcome.message}</p>
        {outcome.success && convo && (
          <div className="results-grid">
            <ItemCard artifact={ARTIFACT_BY_ID[convo.targetId]} />
          </div>
        )}
        <div className="divider" />
        <button onClick={() => {
          if (outcome.success && convo) {
            onAccept(convo.targetId, outcome.loanWeeks,
              outcome.weeklyFee, convo.guest.name);
          }
          setDone(true);
          setOutcome(null); setConvo(null); setViewing(null);
        }}>
          {outcome.success ? 'Hang the Loan & Return' : 'Return to the Gala'}
        </button>
      </div>
    );
  }

  // --- after a loan is hung, or the player leaves -----------
  if (done) {
    return (
      <div className="panel">
        <h2>The Gala Ends<span className="sub">the evening is over</span></h2>
        <p className="empty-note">
          The guests depart. Any loan you secured now hangs in your galleries
          — for a while.
        </p>
        <div className="divider" />
        <button onClick={onClose}>Leave the Gala</button>
      </div>
    );
  }

  // --- the conversation mini-game ---------------------------
  if (convo) {
    const art = ARTIFACT_BY_ID[convo.targetId];
    if (convo.finished) {
      return (
        <div className="panel">
          <h2>{convo.guest.name}
            <span className="sub">the conversation concludes</span></h2>
          <p className="empty-note">{convo.lastText}</p>
          <p className="empty-note">
            You have made your case for {art.name}. Time to see how it landed.
          </p>
          <div className="divider" />
          <button onClick={() => setOutcome(Gala.conversationOutcome(convo))}>
            See Their Answer
          </button>
        </div>
      );
    }
    return (
      <div className="panel">
        <h2>{convo.guest.name}
          <span className="sub">
            round {convo.round + 1} of {convo.totalRounds}
          </span>
        </h2>
        <p className="empty-note">
          {convo.guest.archetype.name} — {convo.guest.archetype.blurb}
        </p>
        <div className="convo-target">
          Pursuing: <b>{art.name}</b> · {STYLES[art.style].name} ·{' '}
          <RarityPill score={art.score} />
        </div>
        <div className="convo-reaction">{convo.lastText}</div>
        <div className="divider" />
        <div className="convo-options">
          {convo.options.map((line, i) => (
            <button key={i} className="convo-line"
              onClick={() => setConvo(Gala.chooseLine(convo, line))}>
              <span className="convo-tag">{Gala.TAG_LABEL[line.tag]}</span>
              <span className="convo-text">"{line.text}"</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- inspecting one guest's collection --------------------
  if (viewing) {
    return (
      <div className="panel">
        <h2>{viewing.name}
          <span className="sub">{viewing.archetype.name}</span></h2>
        <p className="empty-note">{viewing.archetype.blurb}</p>
        <div className="divider" />
        <div className="filter-group-label">Their Collection — choose a target</div>
        <p className="drag-hint">
          Pick the work you will pursue. The conversation that follows
          decides whether they part with it.
        </p>
        <div className="results-grid">
          {viewing.collection.map(id => {
            const art = ARTIFACT_BY_ID[id];
            return (
              <button key={id} className="gala-target"
                onClick={() => setConvo(
                  Gala.startConversation(viewing, id))}>
                <ItemCard artifact={art} />
                <span className="gala-pick">Pursue this work</span>
              </button>
            );
          })}
        </div>
        <div className="divider" />
        <button className="ghost" onClick={() => setViewing(null)}>
          Back to the Guests
        </button>
      </div>
    );
  }

  // --- the guest list ---------------------------------------
  return (
    <div className="panel">
      <h2>The Gala<span className="sub">work the room</span></h2>
      <p className="empty-note">
        These guests each hold a collection. Approach one to inspect what
        they own and choose a piece to pursue. You may only attempt one
        guest — choose with care.
      </p>
      <div className="divider" />
      {guests.map(g => (
        <div className="row" key={g.id}>
          <div className="meta">
            <div className="name">{g.name}</div>
            <div className="info">
              {g.archetype.name} — owns {g.collection.length} notable work(s)
            </div>
          </div>
          <button onClick={() => setViewing(g)}>Approach</button>
        </div>
      ))}
      <div className="divider" />
      <button className="ghost" onClick={onClose}>Leave the Gala</button>
    </div>
  );
}


/* ---- a small SVG line chart for the weekly history -------- */
function WeekChart({
  data, label, color, fmt,
}: {
  data: { week: number; value: number }[];
  label: string; color: string;
  fmt?: (n: number) => string;
}) {
  const W = 300, H = 90, PAD = 6;
  if (data.length === 0) {
    return (
      <div className="weekchart">
        <div className="weekchart-label">{label}</div>
        <p className="empty-note" style={{ fontSize: 11 }}>
          No weeks recorded yet — advance a week to begin the history.
        </p>
      </div>
    );
  }
  const vals = data.map(d => d.value);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const pts = data.map((d, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((d.value - min) / span) * (H - PAD * 2);
    return { x, y, d };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const latest = data[data.length - 1].value;
  return (
    <div className="weekchart">
      <div className="weekchart-label">
        {label}
        <span className="weekchart-latest" style={{ color }}>
          {fmt ? fmt(latest) : latest.toLocaleString()}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="weekchart-svg">
        <path d={path} fill="none" stroke={color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
        ))}
      </svg>
      <div className="weekchart-axis">
        <span>wk {data[0].week}</span>
        <span>wk {data[data.length - 1].week}</span>
      </div>
    </div>
  );
}

function BusinessTab({
  state, setState, apply,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const bizMuseum = E.activeMuseum(state);
  const [priceInput, setPriceInput] = useState(String(bizMuseum.ticket));
  const building = BUILDINGS[bizMuseum.buildingId];

  // a live preview of visitors/revenue at the typed price
  const preview = { ...state, ticket: parseInt(priceInput || '0', 10) };

  // the last 10 weeks of history for the charts
  const last10 = state.history.slice(-10);

  return (
    <>
      <div className="panel">
        <h2>Museum Trends<span className="sub">the last 10 weeks</span></h2>
        <WeekChart label="Average Daily Visitors" color="#2f6485"
          data={last10.map(h => ({ week: h.week, value: h.dailyVisitors }))} />
        <WeekChart label="Fame" color="#b06d1f"
          data={last10.map(h => ({ week: h.week, value: h.fame }))} />
        <WeekChart label="Collection Quality" color="#4a6149"
          data={last10.map(h => ({ week: h.week, value: h.quality }))} />
      </div>

      <div className="panel">
        <h2>Ticket Pricing<span className="sub">admission</span></h2>
        <p className="empty-note">
          Visitors follow demand: a high price on a thin collection draws
          almost no one. The fair price rises as your museum grows.
        </p>
        <div className="field" style={{ maxWidth: 180 }}>
          <label>Ticket Price (§)</label>
          <input value={priceInput} inputMode="numeric"
            onChange={e => setPriceInput(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <div className="info" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          At §{preview.ticket}: ~{Math.round(E.dailyVisitors(preview)).toLocaleString()} visitors/day ·
          {' '}~{money(E.computeRevenue(preview))} revenue/week
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            disabled={parseInt(priceInput || '0', 10) === bizMuseum.ticket}
            onClick={() => setState(E.setTicket(state, parseInt(priceInput || '0', 10)))}>
            Set Price
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Advertising<span className="sub">draw a crowd</span></h2>
        {bizMuseum.adWeeksLeft > 0 ? (
          <p className="empty-note">
            A campaign is running — {bizMuseum.adWeeksLeft} week(s) left, visitors
            up ×{AD_CAMPAIGN.visitorMult}.
          </p>
        ) : (
          <>
            <p className="empty-note">
              A {AD_CAMPAIGN.weeks}-week campaign lifts visitors ×{AD_CAMPAIGN.visitorMult}.
            </p>
            <button disabled={state.funds < AD_CAMPAIGN.cost}
              onClick={() => apply(E.runAdCampaign(state))}>
              Launch Campaign · {money(AD_CAMPAIGN.cost)}
            </button>
          </>
        )}
      </div>

      <SponsorsPanel state={state} apply={apply} museum={bizMuseum}
        building={building} />
    </>
  );
}

/* the Sponsors panel — court term-based building & wing sponsors */
function SponsorsPanel({
  state, apply, museum, building,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
  museum: ReturnType<typeof E.activeMuseum>;
  building: typeof BUILDINGS[string];
}) {
  const [scope, setScope] = useState<'building' | 'wing'>('building');
  const [hallId, setHallId] = useState<string>(building.halls[0]?.id || '');
  const [term, setTerm] = useState<number>(52);
  const [firm, setFirm] = useState<string>('');

  const firms = E.availableFirms(state, museum.id);
  const chk = E.canSponsor(state, museum.id, scope,
    scope === 'wing' ? hallId : null);
  const pay = E.sponsorWeeklyPay(state, museum.id, scope, term);
  const total = pay * term;

  return (
    <div className="panel">
      <h2>Sponsors<span className="sub">patrons of {museum.name}</span></h2>

      {museum.sponsors.length > 0 && (
        <>
          <div className="filter-group-label">Current Sponsors</div>
          {museum.sponsors.map(sp => (
            <div className="row" key={sp.id}>
              <div className="meta">
                <div className="name">{sp.name}</div>
                <div className="info">
                  {sp.scope === 'building'
                    ? 'Sponsors the building'
                    : `Sponsors the ${museum.wingNames[sp.hallId || ''] 
                        || building.halls.find(h => h.id === sp.hallId)?.name 
                        || 'wing'}`}
                  {' · '}{money(sp.weeklyPay)}/week · {sp.weeksLeft} week(s) left
                </div>
              </div>
            </div>
          ))}
          <div className="divider" />
        </>
      )}

      <div className="filter-group-label">Court a Sponsor</div>
      <p className="empty-note">
        A sponsor backs your building or a wing for a fixed term, paying
        weekly. The richer your museum's fame and quality, the better the
        offer. The space bears the sponsor's name until the term ends.
      </p>

      {firms.length === 0 ? (
        <p className="empty-note">
          Every sponsor firm is already backing this museum.
        </p>
      ) : (
        <>
          <div className="filter-group-label">What to sponsor</div>
          <div className="filter-bar">
            <span className={'filter-chip' + (scope === 'building' ? ' active' : '')}
              onClick={() => setScope('building')}>
              The Building
            </span>
            <span className={'filter-chip' + (scope === 'wing' ? ' active' : '')}
              onClick={() => setScope('wing')}>
              A Wing
            </span>
          </div>

          {scope === 'wing' && (
            <>
              <div className="filter-group-label">Which wing</div>
              <div className="filter-bar">
                {building.halls.map(h => (
                  <span key={h.id}
                    className={'filter-chip' + (hallId === h.id ? ' active' : '')}
                    onClick={() => setHallId(h.id)}>
                    {museum.wingNames[h.id] || h.name}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="filter-group-label">Term</div>
          <div className="filter-bar">
            <span className={'filter-chip' + (term === 26 ? ' active' : '')}
              onClick={() => setTerm(26)}>26 weeks</span>
            <span className={'filter-chip' + (term === 52 ? ' active' : '')}
              onClick={() => setTerm(52)}>52 weeks</span>
          </div>

          <div className="filter-group-label">Sponsor firm</div>
          <div className="filter-bar">
            {firms.map(f => (
              <span key={f}
                className={'filter-chip' + (firm === f ? ' active' : '')}
                onClick={() => setFirm(f)}>
                {f}
              </span>
            ))}
          </div>

          <p className="empty-note">
            {firm
              ? `${firm} would pay ${money(pay)}/week for ${term} weeks — `
                + `${money(total)} in total.`
              : `A ${term}-week deal at this museum's standing pays `
                + `${money(pay)}/week (${money(total)} total). Choose a firm.`}
          </p>
          {!chk.ok && (
            <p className="empty-note" style={{ color: 'var(--rare-icon)' }}>
              {chk.reason}
            </p>
          )}
          <div className="divider" />
          <button disabled={!firm || !chk.ok}
            onClick={() => apply(E.courtSponsor(state, museum.id, scope,
              scope === 'wing' ? hallId : null, term, firm))}>
            Sign {firm || 'Sponsor'} · {money(total)} over {term} wks
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================
   COMPETITORS TAB — city & global rankings
   ============================================================ */
type RankRec = {
  id: string; name: string; sub: string;
  fame: number; quality: number; visitors: number;
  you?: boolean;
};

function CompetitorsTab({ state }: { state: GameState }) {
  const [scope, setScope] = useState<'city' | 'global'>('city');
  const [metric, setMetric] = useState<'fame' | 'quality' | 'visitors'>('fame');

  // build the rankable list. `visitors` here is AVERAGE DAILY —
  // the player's true daily draw, and the static/rival weekly
  // figures divided down to a daily average.
  // each of the player's open museums ranks on its own; a
  // combined "all museums" entry shows the player's total reach.
  const museumRecs: RankRec[] = E.openMuseums(state).map(m => ({
    id: 'you-' + m.id,
    name: m.name,
    sub: `Your museum · ${BUILDINGS[m.buildingId].name}`,
    fame: m.fame,
    quality: E.museumQuality(state, m.id),
    visitors: Math.round(E.dailyVisitors(state, m)),
    you: true,
  }));
  const combined: RankRec = {
    id: 'you-total', name: state.galleryName + ' (all museums)',
    sub: 'Your combined reach',
    fame: E.totalFame(state),
    quality: E.openMuseums(state).reduce(
      (a, m) => a + E.museumQuality(state, m.id), 0),
    visitors: Math.round(E.openMuseums(state).reduce(
      (a, m) => a + E.dailyVisitors(state, m), 0)), you: true,
  };
  // the combined entry only matters when there are several museums
  const youRecs: RankRec[] = E.openMuseums(state).length > 1
    ? [combined, ...museumRecs] : museumRecs;
  const rivalRecs: RankRec[] = state.rivals.map(r => ({
    id: r.id, name: r.name, sub: 'Rival curator — Your City',
    fame: r.fame, quality: r.quality, visitors: Math.round(r.visitors / 7),
  }));
  const staticRecs: RankRec[] = STATIC_MUSEUMS
    .filter(m => scope === 'global' ? true : m.inYourCity)
    .map(m => ({
      id: m.id, name: m.name,
      sub: `${m.tier[0].toUpperCase() + m.tier.slice(1)} · ${m.city}`,
      fame: m.fame, quality: m.quality, visitors: Math.round(m.visitors / 7),
    }));

  const all = [...youRecs, ...rivalRecs, ...staticRecs];
  all.sort((a, b) => b[metric] - a[metric]);
  // "your position" is your best-ranked museum (ignoring the
  // combined-total row, which isn't a real competing museum)
  const myPos = all.findIndex(r => r.you && r.id !== 'you-total') + 1;
  const metricLabel = metric === 'visitors' ? 'daily visitors' : metric;

  return (
    <div className="panel">
      <h2>Competitors<span className="sub">where you stand</span></h2>
      <div className="rank-toggle">
        <div className={'filter-chip' + (scope === 'city' ? ' active' : '')}
          onClick={() => setScope('city')}>Your City</div>
        <div className={'filter-chip' + (scope === 'global' ? ' active' : '')}
          onClick={() => setScope('global')}>Global</div>
      </div>
      <div className="rank-toggle">
        {(['fame', 'quality', 'visitors'] as const).map(m => (
          <div key={m}
            className={'filter-chip' + (metric === m ? ' active' : '')}
            onClick={() => setMetric(m)}>
            {m === 'visitors' ? 'Daily Visitors' : m[0].toUpperCase() + m.slice(1)}
          </div>
        ))}
      </div>
      <p className="empty-note">
        Ranked by {metricLabel} — you are #{myPos} of {all.length}
        {' '}{scope === 'city' ? 'in your city' : 'worldwide'}.
      </p>
      <div className="divider" />
      {all.map((r, i) => (
        <div key={r.id} className={'rank-row' + (r.you ? ' you' : '')}>
          <div className="rank-pos">{i + 1}</div>
          <div className="rank-body">
            <div className="rank-name">{r.name}</div>
            <div className="rank-sub">{r.sub}</div>
          </div>
          <div className="rank-stat">
            {r[metric].toLocaleString()}
            {metric === 'visitors' ? <span className="rank-unit"> /day</span> : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   CODEX TAB — every artwork; unowned shown locked
   ============================================================ */
function CodexTab({
  state, onArtifact,
}: {
  state: GameState;
  onArtifact: (id: string) => void;
}) {
  const [fRarity, setFRarity] = useState<string>('all');
  const [fType, setFType] = useState<string>('all');
  const [fStyle, setFStyle] = useState<string>('all');

  const owned = new Set(state.owned);

  const list = ARTIFACTS.filter(a => {
    if (fRarity !== 'all' && rarityForScore(a.score).id !== fRarity) return false;
    if (fType !== 'all' && a.type !== fType) return false;
    if (fStyle !== 'all' && a.style !== fStyle) return false;
    return true;
  });

  return (
    <div className="panel">
      <h2>The Codex<span className="sub">every known work</span></h2>
      <p className="empty-note">
        Works you have not acquired are catalogued but unidentified — only
        their rarity, type and style are known.
      </p>

      <div className="filter-group-label">Rarity</div>
      <div className="filter-bar">
        <Chip on={fRarity === 'all'} onClick={() => setFRarity('all')}>All</Chip>
        {RARITY_BANDS.map(b => (
          <Chip key={b.id} on={fRarity === b.id}
            onClick={() => setFRarity(b.id)}>{b.name}</Chip>
        ))}
      </div>

      <div className="filter-group-label">Type</div>
      <div className="filter-bar">
        <Chip on={fType === 'all'} onClick={() => setFType('all')}>All</Chip>
        {ART_TYPES.map(t => (
          <Chip key={t} on={fType === t} onClick={() => setFType(t)}>{t}</Chip>
        ))}
      </div>

      <div className="filter-group-label">Style</div>
      <div className="filter-bar">
        <Chip on={fStyle === 'all'} onClick={() => setFStyle('all')}>All</Chip>
        {STYLE_IDS.map(s => (
          <Chip key={s} on={fStyle === s}
            onClick={() => setFStyle(s)}>{STYLES[s].name}</Chip>
        ))}
      </div>

      <div className="codex-count">
        {list.length} work(s) · {list.filter(a => owned.has(a.id)).length} in your collection
      </div>
      <div>
        {list.map(a => {
          const isOwned = owned.has(a.id);
          const band = rarityForScore(a.score);
          return (
            <div key={a.id} className="codex-row"
              style={{ cursor: isOwned ? 'pointer' : 'default' }}
              onClick={() => { if (isOwned) onArtifact(a.id); }}>
              <div className="codex-id">{a.id}</div>
              <div className="codex-body">
                <div className={'codex-name' + (isOwned ? '' : ' locked')}>
                  {isOwned ? a.name : '??????'}
                </div>
                <div className="codex-sub">
                  {a.type} · {STYLES[a.style].name}
                  {isOwned ? ` · ${a.year}` : ''}
                </div>
              </div>
              <span className={'pill ' + band.cls}>{band.name}</span>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="empty-note">No works match these filters.</p>
        )}
      </div>
    </div>
  );
}
function Chip({
  on, onClick, children,
}: {
  on: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <span className={'filter-chip' + (on ? ' active' : '')} onClick={onClick}>
      {children}
    </span>
  );
}

/* ============================================================
   (End screen removed — play is open-ended, no week cap.)
   ============================================================ */
