/* ============================================================
   APP  ( src/ui/ )
   React root. GameState in useState; handlers call pure Engine
   functions. Auction tick loop is a useEffect interval.

   Two collection screens:
     - Map        : districts -> fixed building lists -> acquire/move
     - Galleries  : cutaway interior; select room, set specialty,
                    drag-drop (or tap) artworks into wall slots.
   ============================================================ */
import { useState, useEffect, useRef, useCallback } from 'react';
import './styles.css';
import type {
  GameState, CategoryId, Room, TicketPrice,
} from '../data/types';
import {
  CATEGORIES, CATEGORY_IDS, BUILDINGS, TICKET_PRICING, AD_CAMPAIGN,
  START, ROOM_CAPACITY, DISTRICTS, districtOfBuilding, typeIcon,
  rarityForScore,
} from '../data/constants';
import { ARTIFACT_BY_ID } from '../data/artifacts';
import * as E from '../engine/game';
import * as Auc from '../engine/auction';
import { money, stars } from '../engine/util';
import { Thumb, RarityPill, ArtifactDetail } from './components';

type Tab = 'galleries' | 'map' | 'week' | 'specialties' | 'manage' | 'records';

export default function App() {
  const [state, setState] = useState<GameState>(() => E.newGame());
  const [tab, setTab] = useState<Tab>('galleries');
  const [toast, setToast] = useState<string | null>(null);
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 2600);
  }, []);

  /* --- auction tick loop ----------------------------------- */
  const lastRef = useRef<number>(0);
  useEffect(() => {
    if (!state.auction || state.auction.over) return;
    lastRef.current = performance.now();
    const handle = window.setInterval(() => {
      setState(s => {
        if (!s.auction || s.auction.over) return s;
        const now = performance.now();
        const delta = now - lastRef.current;
        lastRef.current = now;
        return { ...s, auction: Auc.tickAuction(s, delta) };
      });
    }, 100);
    return () => window.clearInterval(handle);
  }, [state.auction?.over, state.auction?.artifactId]);

  const apply = (res: { state: GameState; error?: string }) => {
    if (res.error) { flash(res.error); return; }
    setState(res.state);
  };

  if (state.phase === 'choose-specialty') {
    return <ChooseSpecialty onPick={cat => setState(E.chooseSpecialty(state, cat))} />;
  }
  if (state.phase === 'ended') {
    return (
      <Shell state={state} tab={tab} setTab={() => {}} hideTabs>
        <EndScreen state={state}
          onRestart={() => { setState(E.newGame()); setTab('galleries'); }} />
      </Shell>
    );
  }

  let body: React.ReactNode;
  if (openArtifactId) {
    body = (
      <ArtifactDetail artifact={ARTIFACT_BY_ID[openArtifactId]}
        onBack={() => setOpenArtifactId(null)} />
    );
  } else if (tab === 'galleries') {
    body = <GalleriesTab state={state} apply={apply} flash={flash}
      onArtifact={setOpenArtifactId} />;
  } else if (tab === 'map') {
    body = <MapTab state={state} apply={apply} />;
  } else if (tab === 'week') {
    body = <WeekTab state={state} setState={setState} flash={flash}
      goGalleries={() => setTab('galleries')} />;
  } else if (tab === 'specialties') {
    body = <SpecialtiesTab state={state} apply={apply} />;
  } else if (tab === 'manage') {
    body = <ManageTab state={state} setState={setState} apply={apply} />;
  } else {
    body = <RecordsTab state={state} />;
  }

  return (
    <Shell state={state} tab={tab}
      setTab={t => { setOpenArtifactId(null); setTab(t); }}>
      {body}
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

/* ============================================================
   SHELL
   ============================================================ */
function Shell({
  state, tab, setTab, hideTabs, children,
}: {
  state: GameState; tab: Tab; setTab: (t: Tab) => void;
  hideTabs?: boolean; children: React.ReactNode;
}) {
  const tabs: [Tab, string][] = [
    ['galleries', 'Galleries'], ['map', 'Map'], ['week', 'This Week'],
    ['specialties', 'Specialties'], ['manage', 'Manage'], ['records', 'Records'],
  ];
  return (
    <>
      <header>
        <h1>Museum Wars</h1>
        <span className="tagline">a 50-week run</span>
      </header>
      <div className="stats">
        <Stat label="Week" value={`${Math.min(state.week, START.totalWeeks)} / ${START.totalWeeks}`} />
        <Stat label="Funds" value={money(state.funds)} />
        <Stat label="Fame" value={String(state.fame)} />
        <Stat label="Quality" value={String(E.museumQuality(state))} />
        <Stat label="Rival" value={String(state.rivalFame)} />
        <Stat label="Rank" value={E.ranking(state) === 1 ? '#1' : '#2'} />
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
   CHOOSE SPECIALTY
   ============================================================ */
function ChooseSpecialty({ onPick }: { onPick: (c: CategoryId) => void }) {
  const [offered] = useState<CategoryId[]>(() => {
    const pool = [...CATEGORY_IDS];
    const out: CategoryId[] = [];
    while (out.length < 3 && pool.length)
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  });
  return (
    <>
      <header>
        <h1>Museum Wars</h1>
        <span className="tagline">found your museum</span>
      </header>
      <main>
        <div className="panel">
          <h2>Opening Acquisition Event
            <span className="sub">choose a founding specialty</span></h2>
          <p className="empty-note">
            Your museum begins as a single rented room. The field you choose
            shapes the events that come to you each week. Further specialties
            can be researched later as your fame grows.
          </p>
          <div className="divider" />
          {offered.map(cid => (
            <div className="row" key={cid}>
              <div className="meta">
                <div className="name">{CATEGORIES[cid].name}</div>
                <div className="info">
                  Auctions and donations in this field will come to you.
                </div>
              </div>
              <button onClick={() => onPick(cid)}>Found</button>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

/* ============================================================
   MAP TAB — city image with round district buttons
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
              project's <b>public/</b> folder. The district markers below still
              work.
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
              style={{
                left: d.pos.x + '%', top: d.pos.y + '%',
                background: d.accent,
              }}
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

      {/* selected district detail */}
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
                      {b.blurb} · {rooms} rooms · prestige ×{b.prestige}
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
const ROOM_TINT: Record<CategoryId, string> = {
  renaissance: '#3f4a31', egypt: '#5e3526',
  eastasia: '#5a2e2a', sculpture: '#3a4654',
};
const PLAQUE_TINT: Record<CategoryId, string> = {
  renaissance: '#2f3b2c', egypt: '#4a2e1f',
  eastasia: '#4a2421', sculpture: '#2c3744',
};

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

  // unplaced collection = owned minus everything in rooms (+ pending)
  const placed = new Set(state.rooms.flatMap(r => r.items));
  const unplaced = state.owned.filter(id => !placed.has(id));
  if (state.pendingItemId && !unplaced.includes(state.pendingItemId))
    unplaced.unshift(state.pendingItemId);

  const placeInto = (artId: string, roomId: number) => {
    const art = ARTIFACT_BY_ID[artId];
    const room = state.rooms.find(r => r.id === roomId)!;
    if (!E.canPlace(room, art.category)) {
      flash(E.roomIsFull(room) ? 'That room is full.'
        : 'That room is themed to a different field.');
      return;
    }
    const s2: GameState = { ...state, pendingItemId: artId };
    apply(E.placeArtifact(s2, roomId));
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
            Drag a work from your collection below into a grey slot — or tap a
            work, then tap a slot. A room takes only works of its specialty.
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
              <GalleryRoom
                key={room.id} state={state} room={room}
                selected={selectedRoom === room.id}
                heldArt={heldArt}
                onSelect={() => setSelectedRoom(
                  selectedRoom === room.id ? null : room.id)}
                onAssign={cat => apply(E.assignRoom(state, room.id, cat))}
                onOpen={() => apply(E.openRoom(state))}
                onDropArt={artId => placeInto(artId, room.id)}
                onSlotClick={onArtifact}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="drawer">
        <h3>Your Collection</h3>
        {unplaced.length === 0 ? (
          <p className="empty-note">
            Every work you own is on display. Win more at auction from the
            This Week tab.
          </p>
        ) : (
          <>
            <div className="drag-hint">
              {unplaced.length} work(s) in storage, awaiting a wall.
            </div>
            <div className="drawer-strip">
              {unplaced.map(id => {
                const art = ARTIFACT_BY_ID[id];
                const band = rarityForScore(art.score);
                return (
                  <div key={id}
                    className={'drawer-chip' + (heldArt === id ? ' selected' : '')}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', id);
                      setHeldArt(id);
                    }}
                    onClick={() => setHeldArt(heldArt === id ? null : id)}>
                    <span className="chip-dot" style={{ background: band.hex }} />
                    <span>{typeIcon(art.type)} {art.name}</span>
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
  onSelect, onAssign, onOpen, onDropArt, onSlotClick,
}: {
  state: GameState; room: Room; selected: boolean; heldArt: string | null;
  onSelect: () => void;
  onAssign: (c: CategoryId) => void;
  onOpen: () => void;
  onDropArt: (artId: string) => void;
  onSlotClick: (artId: string) => void;
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
          <div className="pname">{CATEGORIES[room.researching.specialty].name}</div>
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
  const heldCat = heldArt ? ARTIFACT_BY_ID[heldArt].category : null;
  const droppable = !!theme && heldCat === theme && !E.roomIsFull(room);

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
            {state.specialties.map(sp => (
              <button key={sp} className="assign-btn" onClick={() => onAssign(sp)}>
                {CATEGORIES[sp].name}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ color: '#d8c9a6', fontSize: 11, fontStyle: 'italic',
            textAlign: 'center', margin: 'auto 0' }}>
            Unassigned — tap the plaque to choose a specialty.
          </div>
        )}
      </div>
    );
  }

  const slots: (string | null)[] = [];
  for (let i = 0; i < ROOM_CAPACITY; i++) slots.push(room.items[i] || null);

  return (
    <div
      className={'groom' + (selected ? ' selected' : '')
        + (dragOver && droppable ? ' droppable' : '')}
      style={{ ['--room-tint' as string]: ROOM_TINT[theme] }}
      onDragOver={e => { if (droppable) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDropArt(id);
      }}>
      <div className="groom-plaque"
        style={{ ['--plaque' as string]: PLAQUE_TINT[theme] }}
        onClick={onSelect}>
        <div className="pname">{CATEGORIES[theme].name}</div>
        <div className="psub">{room.items.length}/{ROOM_CAPACITY} · room</div>
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
  state, setState, flash, goGalleries,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  flash: (m: string) => void;
  goGalleries: () => void;
}) {
  if (state.activeEvent) {
    return <EventInterior state={state} setState={setState} flash={flash}
      goGalleries={goGalleries} />;
  }
  const nextWeek = () => setState(E.advanceWeek(state));

  return (
    <div className="panel">
      <h2>Week {state.week}<span className="sub">the museum calendar</span></h2>
      {state.research && (
        <p className="empty-note">
          Research in progress: {CATEGORIES[state.research.specialty].name} —
          {' '}{state.research.weeksLeft} week(s) remaining.
        </p>
      )}
      <div className="divider" />
      {state.events.length === 0 ? (
        <p className="empty-note">
          A quiet week — no acquisition opportunities have come to the museum.
        </p>
      ) : (
        <>
          <p className="empty-note">
            {state.events.length} opportunit{state.events.length === 1 ? 'y' : 'ies'}
            {' '}this week. Attend any you wish, in any order.
          </p>
          <div style={{ marginTop: 10 }}>
            {state.events.map(ev => (
              <div className="event-card" key={ev.id}>
                <div className="event-kind">
                  {ev.kind === 'donation' ? 'Donation Opportunity' : 'Auction Invitation'}
                </div>
                <div className="event-title">{ev.house}</div>
                <div className="event-body">
                  {ev.lotIds.length} works on offer — {ev.skewLabel}.
                  Attendance fee {money(ev.fee)}.
                </div>
                <div className="event-controls">
                  <button disabled={state.funds < ev.fee}
                    onClick={() => {
                      const res = E.attendEvent(state, ev.id);
                      if (res.error) { flash(res.error); return; }
                      setState({
                        ...res.state,
                        auction: Auc.startLot(res.state,
                          res.state.activeEvent!.lotIds[0]),
                      });
                    }}>
                    Attend · {money(ev.fee)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="divider" />
      <button className="big" onClick={nextWeek}>Advance to Next Week →</button>
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

  if (state.pendingItemId) {
    return (
      <div className="panel auction-stage">
        <h2>{ev.house}<span className="sub">lot won</span></h2>
        <p className="empty-note">
          You won this lot. Hang it in a room from the Galleries tab — drag it
          from your collection onto a wall slot — then return to continue.
        </p>
        <div className="divider" />
        <button onClick={goGalleries}>Go to the Galleries</button>
      </div>
    );
  }
  if ((ev.lotIndex || 0) >= ev.lotIds.length) {
    return (
      <div className="panel auction-stage">
        <h2>{ev.house}<span className="sub">concluded</span></h2>
        <p className="empty-note">
          The {ev.kind} has concluded. You acquired {ev.acquired?.length || 0}
          {' '}of {ev.lotIds.length} works.
        </p>
        <div className="divider" />
        <button onClick={() => setState({ ...state, activeEvent: null })}>
          Return to the Week
        </button>
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
    if (!after.pendingItemId
        && (after.activeEvent!.lotIndex || 0) < after.activeEvent!.lotIds.length) {
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
        <div className="bid-line">{art.year} · est. {money(a.estimate)}</div>
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
          <button
            disabled={a.mode === 'announcing' || a.leader === 'player'
              || myNext > state.funds}
            onClick={onBid}>
            {a.leader === 'player' ? 'You lead' : `Bid ${money(myNext)}`}
          </button>
        ) : (
          <button onClick={onContinue}>
            {a.won ? 'Claim & Continue' : (isLast ? 'Conclude' : 'Next Lot')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SPECIALTIES TAB
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
      <h2>Specialties<span className="sub">the fields you master</span></h2>
      {state.specialties.map(sp => (
        <div className="row" key={sp}>
          <div className="meta">
            <div className="name">{CATEGORIES[sp].name}</div>
            <div className="info">
              Events in this field come to your museum each week.
            </div>
          </div>
          <div className="stars">{stars(state.expertise[sp])}</div>
        </div>
      ))}
      <div className="divider" />
      {state.research ? (
        <div className="row">
          <div className="meta">
            <div className="name">
              Researching: {CATEGORIES[state.research.specialty].name}
            </div>
            <div className="info">
              {state.research.weeksLeft} week(s) remaining. A room is reserved.
            </div>
          </div>
        </div>
      ) : !tier ? (
        <p className="empty-note">Every specialty has been mastered.</p>
      ) : (
        <>
          <div className="row">
            <div className="meta">
              <div className="name">Research a New Specialty</div>
              <div className="info">
                Requires {tier.fameReq} fame, a {money(tier.fee)} fee, and an
                open unassigned room. Takes 3–4 weeks.
              </div>
            </div>
          </div>
          {!chk.ok && <p className="empty-note">{chk.reason}</p>}
          {CATEGORY_IDS.filter(c => !state.specialties.includes(c)).map(cid => (
            <div className="row" key={cid}>
              <div className="meta">
                <div className="name">{CATEGORIES[cid].name}</div>
              </div>
              <button disabled={!chk.ok}
                onClick={() => apply(E.startResearch(state, cid))}>
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
   MANAGE TAB
   ============================================================ */
function ManageTab({
  state, setState, apply,
}: {
  state: GameState;
  setState: (s: GameState) => void;
  apply: (r: { state: GameState; error?: string }) => void;
}) {
  const sponsors = E.availableSponsors(state);
  const building = BUILDINGS[state.buildingId];
  const freeHalls = building.halls.filter(h => !state.wingNames[h.id]);
  const [chosenHall, setChosenHall] = useState<string>(freeHalls[0]?.id || '');

  return (
    <>
      <div className="panel">
        <h2>Ticket Pricing<span className="sub">admission</span></h2>
        <p className="empty-note">
          Lower prices draw more visitors; higher prices earn more per head.
        </p>
        <div className="opt-row">
          {(Object.keys(TICKET_PRICING) as TicketPrice[]).map(t => (
            <div key={t}
              className={'opt' + (state.ticket === t ? ' active' : '')}
              onClick={() => setState(E.setTicket(state, t))}>
              {TICKET_PRICING[t].label}
            </div>
          ))}
        </div>
        <div className="info" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          Now: {E.computeVisitors(state).toLocaleString()} visitors/week ·
          {' '}{money(E.computeRevenue(state))} revenue/week
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
   RECORDS TAB
   ============================================================ */
function RecordsTab({ state }: { state: GameState }) {
  return (
    <div className="panel">
      <h2>Records<span className="sub">the standing of your museum</span></h2>
      <div className="row">
        <div className="meta">
          <div className="name">Standing</div>
          <div className="info">
            Your fame {state.fame} · quality {E.museumQuality(state)} —
            rival fame {state.rivalFame} · quality {state.rivalQuality}
          </div>
        </div>
        <div className="stars">
          {E.ranking(state) === 1 ? 'Leading' : 'Trailing'}
        </div>
      </div>
      <div className="row">
        <div className="meta">
          <div className="name">Collection</div>
          <div className="info">
            {state.owned.length} works held ·
            {' '}{state.rooms.filter(E.roomIsFull).length} completed rooms
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="log">
        {state.log.length === 0 ? (
          <div className="empty-note">No records yet.</div>
        ) : (
          state.log.slice(0, 16).map((e, i) => (
            <div key={i} className={'entry ' + e.kind}>{e.text}</div>
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
   END SCREEN
   ============================================================ */
function EndScreen({
  state, onRestart,
}: {
  state: GameState; onRestart: () => void;
}) {
  const s = E.finalScore(state);
  return (
    <div className="end-banner">
      <h2>The Doors Close on Week 50</h2>
      <div className="end-grade">{s.grade}</div>
      <p>Final score: {s.score}</p>
      <p>
        {state.owned.length} works · {s.completeRooms} completed rooms ·
        collection quality {s.quality}
      </p>
      <p>
        {s.rank === 1
          ? 'You finished ahead of The Thorncrest Collection.'
          : `The Thorncrest Collection finished ahead — ${state.rivalFame} fame to your ${state.fame}.`}
      </p>
      <button className="ghost" style={{ marginTop: 14 }} onClick={onRestart}>
        Begin a New Museum
      </button>
    </div>
  );
}
