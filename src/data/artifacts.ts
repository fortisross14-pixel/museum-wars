/* ============================================================
   ARTIFACT DATABASE  ( src/data/ )
   ~32 artifacts across 4 categories. `score` is the master
   quality number; rarity is derived from it. `image` points
   under /artifacts/ — a letter fallback shows until the file
   exists, so no art assets are needed to play.
   ============================================================ */
import type { Artifact } from './types';

export const ARTIFACTS: Artifact[] = [
  /* --- Renaissance Painting -------------------------------- */
  {
    id: 'mona-lisa', name: 'Mona Lisa', category: 'renaissance',
    author: 'Leonardo da Vinci', year: 'c. 1503', type: 'Painting',
    style: 'High Renaissance',
    description: 'A half-length portrait whose sitter seems to watch the room. Famed for its sfumato modelling and unplaceable expression.',
    score: 240, value: 2400, image: 'artifacts/mona-lisa.jpg',
  },
  {
    id: 'birth-venus', name: 'The Birth of Venus', category: 'renaissance',
    author: 'Sandro Botticelli', year: 'c. 1485', type: 'Painting',
    style: 'Early Renaissance',
    description: 'The goddess arrives on a shell, blown ashore by the winds. A defining image of Florentine grace.',
    score: 150, value: 1200, image: 'artifacts/birth-venus.jpg',
  },
  {
    id: 'last-supper', name: 'Study for the Last Supper', category: 'renaissance',
    author: 'Leonardo da Vinci', year: 'c. 1495', type: 'Drawing',
    style: 'High Renaissance',
    description: 'A preparatory study of apostles reacting in turn, working out gesture and grouping.',
    score: 42, value: 520, image: 'artifacts/last-supper.jpg',
  },
  {
    id: 'madonna-rocks', name: 'Madonna of the Rocks', category: 'renaissance',
    author: 'Leonardo da Vinci', year: 'c. 1486', type: 'Painting',
    style: 'High Renaissance',
    description: 'The Virgin, Christ, and infant John set in a shadowed grotto of carefully observed stone.',
    score: 120, value: 980, image: 'artifacts/madonna-rocks.jpg',
  },
  {
    id: 'portrait-youth', name: 'Portrait of a Youth', category: 'renaissance',
    author: 'Raphael (workshop)', year: 'c. 1470', type: 'Painting',
    style: 'Early Renaissance',
    description: 'A composed young man against a plain ground — a workshop piece of quiet confidence.',
    score: 14, value: 180, image: 'artifacts/portrait-youth.jpg',
  },
  {
    id: 'fresco-frag', name: 'Florentine Fresco Fragment', category: 'renaissance',
    author: 'Unknown', year: 'c. 1440', type: 'Fresco',
    style: 'Early Renaissance',
    description: 'A salvaged section of wall painting showing a draped figure, edges left raw.',
    score: 6, value: 70, image: 'artifacts/fresco-frag.jpg',
  },
  {
    id: 'annunciation', name: 'The Annunciation', category: 'renaissance',
    author: 'Fra Angelico (circle)', year: 'c. 1472', type: 'Painting',
    style: 'Early Renaissance',
    description: 'The angel kneels before the Virgin in a tiled loggia, gold leaf catching the light.',
    score: 36, value: 560, image: 'artifacts/annunciation.jpg',
  },
  {
    id: 'sketch-hands', name: 'Study of Hands', category: 'renaissance',
    author: 'Leonardo da Vinci (attr.)', year: 'c. 1474', type: 'Drawing',
    style: 'High Renaissance',
    description: 'Several studies of folded and gesturing hands in silverpoint on prepared paper.',
    score: 9, value: 85, image: 'artifacts/sketch-hands.jpg',
  },

  /* --- Ancient Egypt -------------------------------------- */
  {
    id: 'tut-mask', name: 'Funerary Mask of a Pharaoh', category: 'egypt',
    author: 'Royal Workshop, Thebes', year: 'c. 1323 BCE', type: 'Funerary Object',
    style: 'New Kingdom',
    description: 'A gold mask inlaid with lapis and carnelian, made to rest over the face of a king.',
    score: 225, value: 2100, image: 'artifacts/tut-mask.jpg',
  },
  {
    id: 'rosetta', name: 'Inscribed Granite Stele', category: 'egypt',
    author: 'Ptolemaic Scribes', year: 'c. 196 BCE', type: 'Inscription',
    style: 'Ptolemaic',
    description: 'A decree cut in three scripts — the kind of object that unlocks a lost language.',
    score: 135, value: 1100, image: 'artifacts/rosetta.jpg',
  },
  {
    id: 'canopic', name: 'Alabaster Canopic Jar', category: 'egypt',
    author: 'Unknown', year: 'c. 1300 BCE', type: 'Funerary Object',
    style: 'New Kingdom',
    description: 'A translucent stone jar with a human-headed stopper, made to hold preserved organs.',
    score: 33, value: 430, image: 'artifacts/canopic.jpg',
  },
  {
    id: 'scarab', name: 'Lapis Scarab Amulet', category: 'egypt',
    author: 'Unknown', year: 'c. 1400 BCE', type: 'Jewellery',
    style: 'New Kingdom',
    description: 'A beetle carved from deep blue lapis, worn as a charm of renewal.',
    score: 13, value: 160, image: 'artifacts/scarab.jpg',
  },
  {
    id: 'papyrus', name: 'Book of the Dead Fragment', category: 'egypt',
    author: 'Temple Scribes', year: 'c. 1250 BCE', type: 'Manuscript',
    style: 'New Kingdom',
    description: 'A painted papyrus section with funerary spells and a vignette of judgement.',
    score: 38, value: 480, image: 'artifacts/papyrus.jpg',
  },
  {
    id: 'shabti', name: 'Faience Shabti Figure', category: 'egypt',
    author: 'Unknown', year: 'c. 1100 BCE', type: 'Funerary Object',
    style: 'Third Intermediate',
    description: 'A small glazed figure meant to labour for the dead in the afterlife.',
    score: 5, value: 60, image: 'artifacts/shabti.jpg',
  },
  {
    id: 'tomb-relief', name: 'Painted Tomb Relief', category: 'egypt',
    author: 'Unknown', year: 'c. 1400 BCE', type: 'Relief',
    style: 'New Kingdom',
    description: 'A carved and painted scene of offering-bearers in profile procession.',
    score: 16, value: 210, image: 'artifacts/tomb-relief.jpg',
  },
  {
    id: 'sarcophagus', name: 'Gilded Sarcophagus Lid', category: 'egypt',
    author: 'Royal Workshop', year: 'c. 1000 BCE', type: 'Funerary Object',
    style: 'Third Intermediate',
    description: 'A nested coffin lid, gilded and painted with protective deities.',
    score: 118, value: 1050, image: 'artifacts/sarcophagus.jpg',
  },

  /* --- East Asian Art ------------------------------------- */
  {
    id: 'great-wave', name: 'The Great Wave', category: 'eastasia',
    author: 'Katsushika Hokusai', year: 'c. 1831', type: 'Woodblock Print',
    style: 'Ukiyo-e',
    description: 'A towering wave curls over boats, Mount Fuji small and still beyond.',
    score: 128, value: 900, image: 'artifacts/great-wave.jpg',
  },
  {
    id: 'ming-vase', name: 'Blue-and-White Ming Vase', category: 'eastasia',
    author: 'Imperial Kilns, Jingdezhen', year: 'c. 1420', type: 'Ceramic',
    style: 'Ming Dynasty',
    description: 'A porcelain vase painted in cobalt with dragons among scrolling cloud.',
    score: 44, value: 540, image: 'artifacts/ming-vase.jpg',
  },
  {
    id: 'jade-burial', name: 'Jade Burial Ornament', category: 'eastasia',
    author: 'Unknown', year: 'c. 100 BCE', type: 'Carving',
    style: 'Han Dynasty',
    description: 'A pierced jade plaque from a burial suit, worked to a soft translucence.',
    score: 35, value: 470, image: 'artifacts/jade-burial.jpg',
  },
  {
    id: 'silk-scroll', name: 'Landscape Silk Scroll', category: 'eastasia',
    author: 'Unknown Literati Painter', year: 'c. 1290', type: 'Painting',
    style: 'Song-Yuan',
    description: 'An ink landscape on silk, mist dividing near rocks from far mountains.',
    score: 17, value: 200, image: 'artifacts/silk-scroll.jpg',
  },
  {
    id: 'tea-bowl', name: 'Raku Tea Bowl', category: 'eastasia',
    author: 'Chōjirō (attr.)', year: 'c. 1580', type: 'Ceramic',
    style: 'Momoyama',
    description: 'A hand-formed black tea bowl, valued for its irregular, quiet surface.',
    score: 7, value: 80, image: 'artifacts/tea-bowl.jpg',
  },
  {
    id: 'bronze-mirror', name: 'Bronze Ritual Mirror', category: 'eastasia',
    author: 'Unknown', year: 'c. 200 CE', type: 'Bronze',
    style: 'Han Dynasty',
    description: 'A cast mirror with cosmological patterning on its reverse face.',
    score: 15, value: 170, image: 'artifacts/bronze-mirror.jpg',
  },
  {
    id: 'lacquer-box', name: 'Gold-Inlaid Lacquer Box', category: 'eastasia',
    author: 'Unknown', year: 'c. 1610', type: 'Lacquerware',
    style: 'Edo',
    description: 'A writing box in black lacquer with sprinkled-gold maki-e decoration.',
    score: 8, value: 90, image: 'artifacts/lacquer-box.jpg',
  },
  {
    id: 'buddha-head', name: 'Sandstone Buddha Head', category: 'eastasia',
    author: 'Unknown', year: 'c. 550 CE', type: 'Sculpture',
    style: 'Northern Qi',
    description: 'A serene carved head, eyes lowered, once part of a temple figure.',
    score: 110, value: 960, image: 'artifacts/buddha-head.jpg',
  },

  /* --- Classical Sculpture -------------------------------- */
  {
    id: 'venus-milo', name: 'Marble Venus', category: 'sculpture',
    author: 'Alexandros of Antioch (attr.)', year: 'c. 130 BCE', type: 'Sculpture',
    style: 'Hellenistic',
    description: 'An armless marble goddess, drapery slipping, weight shifting through the hips.',
    score: 205, value: 1900, image: 'artifacts/venus-milo.jpg',
  },
  {
    id: 'discus', name: 'The Discus Thrower', category: 'sculpture',
    author: 'Myron (after)', year: 'c. 450 BCE', type: 'Sculpture',
    style: 'Classical Greek',
    description: 'A marble copy of a lost bronze, the athlete coiled at the top of his throw.',
    score: 122, value: 1050, image: 'artifacts/discus.jpg',
  },
  {
    id: 'bronze-youth', name: 'Bronze Youth', category: 'sculpture',
    author: 'Unknown', year: 'c. 340 BCE', type: 'Bronze',
    style: 'Late Classical',
    description: 'A standing nude youth in bronze, surface darkened to a soft green.',
    score: 41, value: 510, image: 'artifacts/bronze-youth.jpg',
  },
  {
    id: 'roman-bust', name: 'Bust of a Senator', category: 'sculpture',
    author: 'Unknown', year: 'c. 40 CE', type: 'Sculpture',
    style: 'Roman Imperial',
    description: 'A sharply observed portrait bust, lined and unflattering in the Roman manner.',
    score: 15, value: 190, image: 'artifacts/roman-bust.jpg',
  },
  {
    id: 'votive-relief', name: 'Votive Marble Relief', category: 'sculpture',
    author: 'Unknown', year: 'c. 380 BCE', type: 'Relief',
    style: 'Classical Greek',
    description: 'A shallow relief of worshippers approaching a seated deity.',
    score: 6, value: 75, image: 'artifacts/votive-relief.jpg',
  },
  {
    id: 'torso-fragment', name: 'Heroic Torso Fragment', category: 'sculpture',
    author: 'Unknown', year: 'c. 420 BCE', type: 'Sculpture',
    style: 'Classical Greek',
    description: 'A marble torso, limbs and head long lost, musculature still taut.',
    score: 37, value: 460, image: 'artifacts/torso-fragment.jpg',
  },
  {
    id: 'grave-stele', name: 'Carved Grave Stele', category: 'sculpture',
    author: 'Unknown', year: 'c. 350 BCE', type: 'Relief',
    style: 'Classical Greek',
    description: 'A funerary slab showing the deceased in a quiet domestic farewell.',
    score: 16, value: 200, image: 'artifacts/grave-stele.jpg',
  },
  {
    id: 'caryatid', name: 'Temple Caryatid', category: 'sculpture',
    author: 'Unknown', year: 'c. 415 BCE', type: 'Sculpture',
    style: 'Classical Greek',
    description: 'A draped female figure carved to stand in place of a column.',
    score: 115, value: 1000, image: 'artifacts/caryatid.jpg',
  },
];

/** quick lookup by id */
export const ARTIFACT_BY_ID: Record<string, Artifact> =
  Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));
