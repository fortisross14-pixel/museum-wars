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
  GameState, StyleId, Room, SaveSlot, GameEvent,
} from '../data/types';
import {
  STYLES, STYLE_IDS, ART_TYPES, BUILDINGS, AD_CAMPAIGN, START,
  AUCTION_HOUSES, EXPEDITION_KINDS, EXPEDITION_WEEKS,
  DISTRICTS, districtOfBuilding, typeIcon, rarityForScore,
  RARITY_BANDS, STATIC_MUSEUMS,
} from '../data/constants';
import { ARTIFACTS, ARTIFACT_BY_ID } from '../data/artifacts';
import * as E from '../engine/game';
import * as Auc from '../engine/auction';
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
    if (!state.auction || state.auction.over) return;
    lastRef.current = performance.now();
    const handle = window.setInterval(() => {
      setRawState(s => {
        if (!s.auction || s.auction.over) return s;
        const now = performance.now();
        const delta = now - lastRef.current;
        lastRef.current = now;
        return { ...s, auction: Auc.tickAuction(s, delta) };
      });
    }, 100);
    return () => window.clearInterval(handle);
  }, [state.auction?.over, state.auction?.artifactId]);
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
      onPick={artId => setState(E.chooseFoundingArtwork(state, artId))}
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
      <ExpeditionGame expedition={exp}
        onFinish={claimedIds => {
          apply(E.resolveExpedition(state, exp.id, claimedIds));
          setExpeditionGame(null);
        }} />
    ) : null;
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
      onArtifact={setOpenArtifactId} />;
  } else if (tab === 'map') {
    body = <MapTab state={state} apply={apply} />;
  } else if (tab === 'week') {
    body = <WeekTab state={state} setState={setState} flash={flash}
      goGalleries={() => setTab('galleries')} onNextWeek={doNextWeek}
      onExpeditionResult={expId => setExpeditionGame(expId)} />;
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
        <Stat label="Fame" value={String(state.fame)} />
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
  onPick: (artId: string) => void;
  onExit: () => void;
}) {
  const [offered] = useState<string[]>(() => E.foundingArtworkChoices());
  return (
    <>
      <header>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ cursor: 'pointer' }} onClick={onExit}>Museum Wars</h1>
          <span className="tagline">found your museum</span>
        </div>
      </header>
      <main>
        <div className="panel">
          <h2>Opening Acquisition
            <span className="sub">choose your founding work</span></h2>
          <p className="empty-note">
            Every museum begins with a single acquisition. Choose one of these
            works to lead your collection — your museum will specialise in its
            style, and that piece will hang from your opening day. Further
            styles can be researched later as your fame grows.
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
                <button onClick={() => onPick(id)}>Found</button>
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
   MAP TAB
   ============================================================ */
function MapTab({
  state, apply,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const [selected, setSelected] = useState<string>(
    districtOfBuilding(state.buildingId)?.id || 'historic');
  const [mapFailed, setMapFailed] = useState(false);
  const ownedIndex = E.BUILDING_ORDER_PUBLIC.indexOf(state.buildingId);
  const district = DISTRICTS.find(d => d.id === selected)!;

  return (
    <>
      <div className="panel">
        <h2>The City<span className="sub">districts &amp; venues</span></h2>
        <p className="empty-note">
          Tap a district marker to see its venues. You move your museum to a
          greater building as funds allow — the collection comes with you.
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
              const idx = E.BUILDING_ORDER_PUBLIC.indexOf(bid);
              const isHere = bid === state.buildingId;
              const isOwnedPast = idx < ownedIndex;
              const isNext = idx === ownedIndex + 1;
              const rooms = b.halls.reduce((s, h) => s + h.roomCap, 0);
              return (
                <div className="bld-row" key={bid}>
                  <div className="meta">
                    <div className="name">{b.name}</div>
                    <div className="info">
                      {b.blurb} · {rooms} rooms · upkeep {money(b.maintenance)}/wk
                    </div>
                  </div>
                  {isHere ? (
                    <span className="bld-tag here">Current</span>
                  ) : isOwnedPast ? (
                    <span className="bld-tag owned">Left behind</span>
                  ) : isNext ? (
                    <button
                      disabled={state.funds < b.moveCost || !!state.pendingItemId}
                      onClick={() => apply(E.moveToBuilding(state, bid))}>
                      Acquire · {money(b.moveCost)}
                    </button>
                  ) : (
                    <span className="bld-tag locked">Locked</span>
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
  state, apply, flash, onArtifact,
}: {
  state: GameState;
  apply: (r: { state: GameState; error?: string }) => void;
  flash: (m: string) => void;
  onArtifact: (id: string) => void;
}) {
  const building = BUILDINGS[state.buildingId];
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [heldArt, setHeldArt] = useState<string | null>(null);

  const placedSet = new Set(state.rooms.flatMap(r => r.items));
  const unplaced = state.owned.filter(id => !placedSet.has(id));
  if (state.pendingItemId && !unplaced.includes(state.pendingItemId))
    unplaced.unshift(state.pendingItemId);

  const placeInto = (artId: string, roomId: number) => {
    const art = ARTIFACT_BY_ID[artId];
    const room = state.rooms.find(r => r.id === roomId)!;
    if (!E.canPlace(room, art.style)) {
      flash(E.roomIsFull(room) ? 'That room is full.'
        : 'That room is themed to a different style.');
      return;
    }
    apply(E.placeArtifact({ ...state, pendingItemId: artId }, roomId));
    setHeldArt(null);
  };

  const halls: Record<string, { name: string; rooms: Room[] }> = {};
  for (const r of state.rooms)
    (halls[r.hallId] = halls[r.hallId] || { name: r.hallName, rooms: [] })
      .rooms.push(r);

  return (
    <>
      <div className="panel" style={{ paddingBottom: 8 }}>
        <h2>{building.name}<span className="sub">your galleries</span></h2>
        {unplaced.length > 0 && (
          <p className="drag-hint">
            Drag a work from your collection into a grey slot — or tap a work,
            then tap a slot. A room takes only works of its style.
          </p>
        )}
      </div>

      {Object.entries(halls).map(([hid, hall]) => (
        <div className="gallery-frame" key={hid}>
          <div className="gallery-hall-label">
            {hall.name}
            {state.wingNames[hid] ? ` — the ${state.wingNames[hid]} Wing` : ''}
          </div>
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
      ))}

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
                return (
                  <div key={id}
                    className={'acq' + (heldArt === id ? ' selected' : '')}
                    draggable
                    onDragStart={e => {
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
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
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

  const slots: (string | null)[] = [];
  for (let i = 0; i < 5; i++) slots.push(room.items[i] || null);

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
        <div className="psub">{room.items.length}/5 · room</div>
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
          const initials = art.name.split(/\s+/)
            .filter(w => /[A-Za-z]/.test(w))
            .slice(0, 2).map(w => w[0].toUpperCase()).join('');
          return (
            <div key={i} className="slot filled"
              style={{ ['--rar' as string]: band.hex }}
              title={`${art.name} — ${band.name} (score ${art.score})`}
              onClick={() => onSlotClick(artId)}>
              <button className="slot-remove"
                title="Move to private collection"
                onClick={e => { e.stopPropagation(); onRemoveArt(artId); }}>
                ×
              </button>
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
  state, setState, flash, goGalleries, onNextWeek, onExpeditionResult,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  flash: (m: string) => void;
  goGalleries: () => void;
  onNextWeek: () => void;
  onExpeditionResult: (expeditionId: string) => void;
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
            const def = EXPEDITION_KINDS.find(k => k.id === exp.kind)!;
            return (
              <div className="event-card" key={exp.id}>
                <div className="event-kind">Expedition</div>
                <div className="event-title">{def.name}</div>
                <div className="event-body">
                  Your team sought {STYLES[exp.style].name} works.
                  {exp.incident
                    ? ' They met trouble on the way — the haul was reduced.'
                    : ' The journey went smoothly.'}
                </div>
                <div className="event-controls">
                  <button onClick={() => onExpeditionResult(exp.id)}>
                    Check Expedition Result
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* auction houses — join the ones your fame has opened */}
      <div className="divider" />
      <div className="filter-group-label">Auction Houses</div>
      {AUCTION_HOUSES.map(h => {
        const joined = state.joinedHouses.includes(h.id);
        const unlocked = state.fame >= h.fameToUnlock;
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
  if (!a) return null;
  const art = ARTIFACT_BY_ID[ev.lotIds[ev.lotIndex || 0]];
  const isLast = (ev.lotIndex || 0) >= ev.lotIds.length - 1;

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
      setState(after);
    }
  };

  const clockText = a.mode === 'announcing' ? '— • —'
    : (Math.max(0, a.clockMs) / 1000).toFixed(1) + 's';
  const clockCls = 'au-clock'
    + (a.mode === 'announcing' ? ' frozen' : a.clockMs <= 1000 ? ' urgent' : '');
  const myNext = a.currentBid + a.increment;

  return (
    <div className="panel auction-stage">
      <h2>{ev.house}
        <span className="sub">
          lot {Math.min((ev.lotIndex || 0) + 1, ev.lotIds.length)} of {ev.lotIds.length}
        </span>
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
      <div className={clockCls}>{clockText}</div>
      <div className="bid-line">
        {a.leader === 'player' ? 'You hold the leading bid'
          : a.leader === 'rival' ? 'A rival holds the leading bid'
          : 'The floor is open'}
      </div>
      <div className="bid-readout">{money(a.currentBid)}</div>
      <div className="rival-tag">{a.message}</div>
      <div className="bid-controls">
        {!a.over ? (
          <>
            <button
              disabled={a.mode === 'announcing' || a.leader === 'player'
                || myNext > state.funds}
              onClick={onBid}>
              {a.leader === 'player' ? 'You lead'
                : myNext > state.funds ? 'Beyond your funds'
                : `Bid ${money(myNext)}`}
            </button>
            <button className="ghost"
              onClick={() => setState(E.passLot(state))}>
              Pass this lot
            </button>
          </>
        ) : (
          <button onClick={onContinue}>
            {a.won ? 'Claim & Continue' : (isLast ? 'See Results' : 'Next Lot')}
          </button>
        )}
      </div>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
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
const ROLE_BLURB: Record<string, string> = {
  curator: 'Lifts weekly fame and draws visitors in their own right.',
  researcher: 'Required to research new styles; a master shortens the work.',
  explorer: 'Leads expeditions, improving what they bring home.',
};

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
                    {' '}<span className="tier-tag">{E.ROLE_NAME[m.role]}</span>
                  </div>
                  <div className="info">
                    {'★'.repeat(m.skill)}{'☆'.repeat(3 - m.skill)} ·
                    {' '}{money(m.wage)}/week — {ROLE_BLURB[m.role]}
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
                    {' '}<span className="tier-tag">{E.ROLE_NAME[c.role]}</span>
                  </div>
                  <div className="info">
                    {'★'.repeat(c.skill)}{'☆'.repeat(3 - c.skill)} ·
                    {' '}{money(c.wage)}/week · signing fee {money(signingFee)}
                  </div>
                  <div className="info">{ROLE_BLURB[c.role]}</div>
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
function initialsOf(name: string): string {
  return name.split(/\s+/).filter(w => /[A-Za-z]/.test(w))
    .slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

interface GameCard {
  cardId: number;
  artId: string;
  initials: string;
}

function ExpeditionGame({
  expedition, onFinish,
}: {
  expedition: { id: string; foundIds: string[]; kind: string; incident: boolean };
  onFinish: (claimedIds: string[]) => void;
}) {
  const found = expedition.foundIds;

  // build the shuffled deck once: two cards per found work
  const [deck] = useState<GameCard[]>(() => {
    const cards: GameCard[] = [];
    found.forEach((artId, i) => {
      const initials = initialsOf(ARTIFACT_BY_ID[artId].name);
      cards.push({ cardId: i * 2, artId, initials });
      cards.push({ cardId: i * 2 + 1, artId, initials });
    });
    // Fisher-Yates shuffle
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  });

  type Phase = 'intro' | 'revealing' | 'playing' | 'done';
  const [phase, setPhase] = useState<Phase>('intro');
  const [flipped, setFlipped] = useState<number[]>([]);   // cardIds face-up now
  const [matchedArt, setMatchedArt] = useState<string[]>([]); // won artIds
  const [matchedCards, setMatchedCards] = useState<number[]>([]);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [pick, setPick] = useState<number[]>([]);          // current 1-2 picks
  const [busy, setBusy] = useState(false);

  // the one-time 3-second reveal
  const doReveal = () => {
    setPhase('revealing');
    setFlipped(deck.map(c => c.cardId));
    window.setTimeout(() => {
      setFlipped([]);
      setPhase('playing');
    }, 3000);
  };

  const onCardClick = (card: GameCard) => {
    if (phase !== 'playing' || busy) return;
    if (matchedCards.includes(card.cardId)) return;
    if (pick.includes(card.cardId)) return;
    const nextPick = [...pick, card.cardId];
    setPick(nextPick);
    if (nextPick.length === 2) {
      setBusy(true);
      const [a, b] = nextPick.map(id => deck.find(c => c.cardId === id)!);
      const isMatch = a.artId === b.artId;
      window.setTimeout(() => {
        if (isMatch) {
          setMatchedArt(m => [...m, a.artId]);
          setMatchedCards(m => [...m, a.cardId, b.cardId]);
        }
        const left = attemptsLeft - 1;
        setAttemptsLeft(left);
        setPick([]);
        setBusy(false);
        // game ends when attempts run out or every pair is found
        const pairsLeft = found.length - (matchedArt.length + (isMatch ? 1 : 0));
        if (left <= 0 || pairsLeft <= 0) setPhase('done');
      }, 900);
    }
  };

  const faceUp = (cardId: number) =>
    flipped.includes(cardId) || pick.includes(cardId)
    || matchedCards.includes(cardId);

  // --- intro -------------------------------------------------
  if (phase === 'intro') {
    return (
      <div className="panel">
        <h2>The Expedition Returns
          <span className="sub">recover what you can</span></h2>
        <p className="empty-note">
          Your team brought back {found.length} work(s) — but the crates are
          unlabelled. Study the cards: each work appears twice. You will see
          every card for three seconds, once. Then you have three attempts to
          match a pair. Each pair you match is yours to keep.
          {expedition.incident
            && ' The expedition met trouble, so the haul is already slim — match carefully.'}
        </p>
        <div className="divider" />
        <button onClick={doReveal}>Reveal the Cards</button>
      </div>
    );
  }

  // --- done --------------------------------------------------
  if (phase === 'done') {
    return (
      <div className="panel">
        <h2>Expedition Concluded
          <span className="sub">{matchedArt.length} work(s) recovered</span></h2>
        {matchedArt.length === 0 ? (
          <p className="empty-note">
            No pairs were matched — the unclaimed crates were lost in the
            confusion. A hard lesson.
          </p>
        ) : (
          <>
            <h3 style={{ marginTop: 4 }}>New Items</h3>
            <p className="drag-hint">
              These works are now in your private collection.
            </p>
            <div className="results-grid">
              {matchedArt.map(id =>
                <ItemCard key={id} artifact={ARTIFACT_BY_ID[id]} />)}
            </div>
          </>
        )}
        <div className="divider" />
        <button onClick={() => onFinish(matchedArt)}>Collect &amp; Continue</button>
      </div>
    );
  }

  // --- revealing / playing ----------------------------------
  return (
    <div className="panel">
      <h2>Match the Findings
        <span className="sub">
          {phase === 'revealing' ? 'study the cards'
            : `${attemptsLeft} attempt(s) left`}
        </span>
      </h2>
      <p className="drag-hint">
        {phase === 'revealing'
          ? 'Memorise the pairs — the cards turn back in a moment.'
          : 'Pick two cards with the same initials to claim that work.'}
      </p>
      <div className="memory-grid">
        {deck.map(card => {
          const up = faceUp(card.cardId);
          const art = ARTIFACT_BY_ID[card.artId];
          const band = rarityForScore(art.score);
          const isMatched = matchedCards.includes(card.cardId);
          return (
            <button key={card.cardId}
              className={'memory-card' + (up ? ' up' : '')
                + (isMatched ? ' matched' : '')}
              style={up ? { ['--rar' as string]: band.hex } : undefined}
              disabled={phase !== 'playing' || isMatched}
              onClick={() => onCardClick(card)}>
              {up ? card.initials : '?'}
            </button>
          );
        })}
      </div>
      {matchedArt.length > 0 && (
        <p className="empty-note" style={{ marginTop: 10 }}>
          Recovered so far: {matchedArt.map(id => ARTIFACT_BY_ID[id].name).join(', ')}.
        </p>
      )}
    </div>
  );
}

/* ============================================================
   EXPEDITIONS TAB — commission, track, and collect expeditions
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

  // commission form state
  const [kind, setKind] = useState<string>(EXPEDITION_KINDS[0].id);
  const [style, setStyle] = useState<string>(state.specialties[0] || '');
  const [budgetInput, setBudgetInput] = useState('');
  const [leaderId, setLeaderId] = useState<string>('');

  const kindDef = EXPEDITION_KINDS.find(k => k.id === kind)!;
  const budget = parseInt(budgetInput || '0', 10);
  const leader = leaderId
    ? state.staff.find(m => m.id === leaderId) : null;
  // a preview of the rarity odds at the chosen budget
  const odds = E.expeditionOdds(Math.max(kindDef.minBudget, budget),
    leader ? leader.skill : 0);
  const bandNames = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legend'];

  const canCommission = budget >= kindDef.minBudget
    && budget <= state.funds && !!style;

  return (
    <>
      {/* ready-to-collect expeditions */}
      {ready.length > 0 && (
        <div className="panel">
          <h2>Returned<span className="sub">awaiting your attention</span></h2>
          <p className="empty-note">
            {ready.length} expedition(s) have returned. Collect their findings
            from the Week tab.
          </p>
        </div>
      )}

      {/* active expeditions */}
      <div className="panel">
        <h2>Expeditions in Progress
          <span className="sub">{active.length} underway</span></h2>
        {active.length === 0 ? (
          <p className="empty-note">
            No expeditions are underway. Commission one below.
          </p>
        ) : (
          active.map(e => {
            const def = EXPEDITION_KINDS.find(k => k.id === e.kind)!;
            const ldr = e.leaderId
              ? state.staff.find(m => m.id === e.leaderId) : null;
            return (
              <div className="row" key={e.id}>
                <div className="meta">
                  <div className="name">{def.name}</div>
                  <div className="info">
                    Seeking {STYLES[e.style].name} · budget {money(e.budget)}
                    {ldr ? ` · led by ${ldr.name}` : ' · no leader'}
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

      {/* commission a new expedition */}
      <div className="panel">
        <h2>Commission an Expedition
          <span className="sub">send a team into the field</span></h2>

        <div className="filter-group-label">Type</div>
        <div className="filter-bar">
          {EXPEDITION_KINDS.map(k => (
            <span key={k.id}
              className={'filter-chip' + (kind === k.id ? ' active' : '')}
              onClick={() => setKind(k.id)}>
              {k.name}
            </span>
          ))}
        </div>
        <p className="empty-note">{kindDef.blurb}</p>

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

        <div className="filter-group-label">Leader</div>
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
        {freeExplorers.length === 0 && (
          <p className="empty-note">
            No expedition leaders are free — hire an Explorer in Personnel for
            better odds.
          </p>
        )}

        <div className="field" style={{ maxWidth: 220 }}>
          <label>Budget (§) — min {money(kindDef.minBudget)}</label>
          <input value={budgetInput} inputMode="numeric"
            placeholder={String(kindDef.minBudget)}
            onChange={e => setBudgetInput(e.target.value.replace(/[^0-9]/g, ''))} />
        </div>
        <p className="empty-note">
          A larger budget finds rarer works. At {money(Math.max(kindDef.minBudget, budget))}:
        </p>
        <div className="odds-bar">
          {odds.map((w, i) => (
            <div key={i} className="odds-seg"
              style={{ flex: Math.max(0.01, w) }}
              title={`${bandNames[i]} ~${Math.round(w)}%`}>
              <span className="odds-label">
                {bandNames[i]} {Math.round(w)}%
              </span>
            </div>
          ))}
        </div>
        <p className="empty-note">
          An expedition runs {EXPEDITION_WEEKS} weeks and may meet trouble on
          the way. World Icons are never found in the field.
        </p>
        <div className="divider" />
        <button disabled={!canCommission}
          onClick={() => {
            apply(E.commissionExpedition(state, kind as never,
              style as never, Math.max(kindDef.minBudget, budget),
              leaderId || null));
            setBudgetInput('');
          }}>
          Commission · {money(Math.max(kindDef.minBudget, budget))}
        </button>
      </div>
    </>
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
  const [priceInput, setPriceInput] = useState(String(state.ticket));
  const sponsors = E.availableSponsors(state);
  const building = BUILDINGS[state.buildingId];
  const freeHalls = building.halls.filter(h => !state.wingNames[h.id]);
  const [chosenHall, setChosenHall] = useState<string>(freeHalls[0]?.id || '');

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
            disabled={parseInt(priceInput || '0', 10) === state.ticket}
            onClick={() => setState(E.setTicket(state, parseInt(priceInput || '0', 10)))}>
            Set Price
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Advertising<span className="sub">draw a crowd</span></h2>
        {state.adWeeksLeft > 0 ? (
          <p className="empty-note">
            A campaign is running — {state.adWeeksLeft} week(s) left, visitors
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

      <div className="panel">
        <h2>Sponsors<span className="sub">patrons &amp; wing names</span></h2>
        {state.sponsors.length > 0 && (
          <>
            {state.sponsors.map(sp => (
              <div className="row" key={sp.id}>
                <div className="meta">
                  <div className="name">{sp.name}</div>
                  <div className="info">
                    +{sp.weeklyBonus} fame/week
                    {sp.wingNamed
                      ? ` · names the ${building.halls.find(h => h.id === sp.wingNamed)?.name || 'a wing'}`
                      : ''}
                  </div>
                </div>
              </div>
            ))}
            <div className="divider" />
          </>
        )}
        {sponsors.length === 0 ? (
          <p className="empty-note">
            No new patrons are interested yet — grow your fame to attract them.
          </p>
        ) : freeHalls.length === 0 ? (
          <p className="empty-note">
            Patrons are interested, but every wing is already named. A larger
            building would offer new wings.
          </p>
        ) : (
          <>
            <p className="empty-note">
              A sponsor gives a one-off gift and recurring fame; in return, a
              wing is named for them.
            </p>
            <div className="opt-row">
              {freeHalls.map(h => (
                <div key={h.id}
                  className={'opt' + (chosenHall === h.id ? ' active' : '')}
                  onClick={() => setChosenHall(h.id)}>
                  {h.name}
                </div>
              ))}
            </div>
            {sponsors.map(sp => (
              <div className="row" key={sp.id}>
                <div className="meta">
                  <div className="name">{sp.name}</div>
                  <div className="info">
                    Gift {money(sp.gift)} · +{sp.weeklyBonus} fame/week
                  </div>
                </div>
                <button disabled={!chosenHall}
                  onClick={() => apply(E.courtSponsor(state, sp.id, chosenHall))}>
                  Court
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
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
  const you: RankRec = {
    id: 'you', name: state.galleryName, sub: 'Your museum — Your City',
    fame: state.fame, quality: E.museumQuality(state),
    visitors: Math.round(E.dailyVisitors(state)), you: true,
  };
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

  const all = [you, ...rivalRecs, ...staticRecs];
  all.sort((a, b) => b[metric] - a[metric]);
  const myPos = all.findIndex(r => r.you) + 1;
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
