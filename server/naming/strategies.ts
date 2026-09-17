/**
 * The Strategy catalog.
 *
 * Per docs/design.md, generation happens under a single named Strategy at a
 * time, and the algorithm — not the model — supplies the word material. The
 * lexicons below are that material: concrete, glossed lexemes that give the
 * model enough specific context to escape its cold-start attractor. A Strategy
 * is a generation constraint, never a judgement about name quality.
 */

export type FamilyId = 'root' | 'craft' | 'nature' | 'instrument' | 'formation' | 'tongue'

export interface Family {
  id: FamilyId
  label: string
  hue: number
}

export const FAMILIES: Family[] = [
  { id: 'root', label: '词根', hue: 38 },
  { id: 'craft', label: '手艺', hue: 18 },
  { id: 'nature', label: '自然', hue: 150 },
  { id: 'instrument', label: '器械', hue: 205 },
  { id: 'formation', label: '构词', hue: 280 },
  { id: 'tongue', label: '语言', hue: 330 },
]

export interface Strategy {
  id: string
  label: string
  family: FamilyId
  /** One line shown to the user next to every candidate born from it. */
  brief: string
  /** The word-formation device, stated to the model as a positive constraint. */
  device: string
  /** Glossed seed lexemes. A random subset is handed to the model each call. */
  lexicon: string[]
}

export const STRATEGIES: Strategy[] = [
  // ─── 词根 ──────────────────────────────────────────────────────────────
  {
    id: 'greek-root',
    label: '希腊词根复合',
    family: 'root',
    brief: '拿两个希腊词根拼成一个新词',
    device:
      'Compound two Ancient Greek roots into a single new word. Transliterate to Latin script the way English scientific vocabulary does (kh→ch, ou→u). The compound must be pronounceable by an English speaker on first sight.',
    lexicon: [
      'nomos (law, custom)', 'thetes (one who sets, placer)', 'kybernetes (helmsman)',
      'stoa (colonnade)', 'khronos (time)', 'topos (place)', 'morphe (shape)',
      'plasma (thing moulded)', 'stigme (point, dot)', 'deixis (pointing out)',
      'lithos (stone)', 'khordе (string, gut)', 'anemos (wind)', 'halos (threshing floor)',
      'pyle (gate)', 'krene (spring, well)', 'okhema (vehicle)', 'ergon (work)',
      'skopos (watcher, target)', 'taxis (arrangement)', 'klima (slope, zone)',
      'peras (limit, boundary)', 'sphena (wedge)', 'zeugma (yoking together)',
      'gnomon (pointer, that which knows)', 'kanon (measuring rod)', 'lexis (word, diction)',
      'thesauros (treasury, storehouse)', 'trope (a turning)', 'holos (whole)',
    ],
  },
  {
    id: 'latin-root',
    label: '拉丁词根复合',
    family: 'root',
    brief: '拿两个拉丁词根拼成一个新词',
    device:
      'Compound two Latin roots into a single new word, joining them with the classical -i- or -o- linking vowel where it sounds right. Aim for the register of Terraform or Aperture, not of pharmaceutical brands.',
    lexicon: [
      'limen (threshold)', 'vellum (calfskin)', 'cardo (hinge, pivot)', 'fornax (furnace)',
      'tessera (mosaic tile, token)', 'clavis (key)', 'lucerna (oil lamp)', 'rivus (stream)',
      'vadum (ford, shallows)', 'ansa (handle, loop)', 'cuneus (wedge)', 'gemma (bud, gem)',
      'stilus (stake, writing tool)', 'norma (carpenter\'s square, rule)', 'libra (balance)',
      'moles (mass, breakwater)', 'sulcus (furrow)', 'fibula (clasp, pin)', 'tegula (roof tile)',
      'vitrum (glass)', 'ferrum (iron)', 'nodus (knot)', 'arcus (arch, bow)',
      'lamina (thin plate)', 'index (pointer, forefinger)', 'canalis (channel, pipe)',
      'obex (barrier, bolt)', 'pagina (page, trellis panel)', 'mensa (table)', 'axis (axle)',
    ],
  },

  // ─── 手艺 ──────────────────────────────────────────────────────────────
  {
    id: 'metallurgy',
    label: '冶金术语挪用',
    family: 'craft',
    brief: '从炼金属的工序里取词',
    device:
      'Take a real term of art from metallurgy and smithing and use it, unchanged or lightly clipped, as the name. Pick terms a metallurgist would recognise and a web developer would not.',
    lexicon: [
      'bloomery (early iron furnace)', 'cupel (bone-ash dish for assaying)', 'tuyere (air pipe into a furnace)',
      'scoria (slag, clinker)', 'quench (rapid cooling)', 'temper (controlled reheat)',
      'billet (semi-finished bar)', 'swage (shaping die)', 'flux (slag-forming additive)',
      'dross (surface impurity)', 'ingot (cast block)', 'anneal (soften by slow cooling)',
      'sinter (fuse powder below melting point)', 'mandrel (shaping shaft)', 'crucible (melting vessel)',
      'ladle (pouring vessel)', 'draw (pull wire through a die)', 'planish (smooth by hammering)',
      'repoussé (raise a relief from behind)', 'fettle (dress a casting)', 'gate (feed channel in a mould)',
      'riser (reservoir feeding a casting)', 'chaplet (core support in a mould)', 'pig (crude cast iron)',
    ],
  },
  {
    id: 'typography',
    label: '活字印刷术语',
    family: 'craft',
    brief: '从铅字与排版工序里取词',
    device:
      'Take a term from hand typesetting, letterpress, or punchcutting and use it as the name. Favour the physical vocabulary of the composing room over modern digital typography words.',
    lexicon: [
      'quoin (wedge that locks a forme)', 'forme (locked-up page of type)', 'galley (tray of set type)',
      'kern (part of a letter overhanging its body)', 'slug (cast line of type)', 'furniture (spacing blocks)',
      'chase (iron frame holding a forme)', 'em (square of the type size)', 'quad (large space)',
      'sort (a single piece of type)', 'matrix (mould a letter is cast in)', 'punch (steel letter-cutting tool)',
      'counter (enclosed space inside a letter)', 'ligature (two letters cast as one)',
      'leading (strips of lead between lines)', 'platen (flat pressing plate)', 'frisket (masking frame)',
      'tympan (packing behind the sheet)', 'imposition (arranging pages on a sheet)',
      'colophon (printer\'s device and note)', 'signature (folded sheet of a book)', 'devil (printer\'s apprentice)',
    ],
  },
  {
    id: 'bookbinding',
    label: '装帧与纸工',
    family: 'craft',
    brief: '从装订、造纸、修书的工序里取词',
    device:
      'Take a term from bookbinding, papermaking, or manuscript conservation and use it as the name. These words are old, concrete and almost never used by software.',
    lexicon: [
      'signature (folded gathering)', 'headband (woven band at the spine)', 'kettle stitch (linking stitch)',
      'deckle (frame that forms a paper edge)', 'vellum (prepared calfskin)', 'gathering (folded sheets in order)',
      'endpaper (leaf joining block to board)', 'spine (bound edge)', 'fore-edge (the opening edge)',
      'quire (four folded sheets)', 'codex (bound book form)', 'palimpsest (reused, scraped parchment)',
      'foxing (rust-coloured spotting)', 'guard (strip reinforcing a fold)', 'tacket (thread tie through a fold)',
      'nipping (pressing a book)', 'paring (thinning leather)', 'marbling (floated ink on paper)',
      'cockle (ripple in dried paper)', 'furnish (the pulp mixture)', 'couch (transfer sheet from mould)',
      'laid line (wire mark in handmade paper)',
    ],
  },
  {
    id: 'masonry',
    label: '石作与营造',
    family: 'craft',
    brief: '从砌石、架桥、起拱的工序里取词',
    device:
      'Take a term from stonemasonry, vaulting, or timber framing and use it as the name. Prefer words for the load-bearing pieces and the joints.',
    lexicon: [
      'voussoir (wedge stone in an arch)', 'keystone (central voussoir)', 'springer (first stone of an arch)',
      'centring (temporary arch formwork)', 'quoin (corner stone)', 'ashlar (dressed squared stone)',
      'rubble (undressed stone fill)', 'corbel (projecting bracket)', 'lintel (span over an opening)',
      'joggle (interlocking notch)', 'plinth (base course)', 'course (horizontal layer)',
      'header (stone laid across the wall)', 'stretcher (stone laid along the wall)', 'bond (pattern of laying)',
      'mortise (socket for a tenon)', 'tenon (projecting tongue)', 'scarf (lengthwise timber joint)',
      'purlin (horizontal roof beam)', 'truss (triangulated frame)', 'batten (thin fixing strip)',
      'pointing (finishing the mortar joint)', 'spall (chip off a stone face)', 'dado (lower wall band)',
    ],
  },
  {
    id: 'weaving',
    label: '织造与绳结',
    family: 'craft',
    brief: '从织机、纺纱、打结里取词',
    device:
      'Take a term from weaving, ropework, or knotting and use it as the name. Note: nautical words are heavily used in container tooling — prefer the loom over the ship.',
    lexicon: [
      'heddle (loop guiding a warp thread)', 'shuttle (carries the weft)', 'reed (comb beating the weft)',
      'warp (lengthwise threads)', 'weft (crosswise threads)', 'selvedge (self-finished edge)',
      'shed (opening the shuttle passes through)', 'dobby (mechanism for small patterns)',
      'jacquard (punch-card pattern loom)', 'skein (coiled length of yarn)', 'sley (to thread the reed)',
      'temple (device holding cloth width)', 'roving (drawn-out fibre before spinning)',
      'nep (small tangle of fibre)', 'slub (thick place in yarn)', 'ply (twisted strands)',
      'whipping (binding a rope end)', 'splice (joining rope by interweaving)', 'bight (a slack loop)',
      'sennit (braided cordage)', 'marline (light two-stranded line)', 'thrum (loom waste end)',
    ],
  },
  {
    id: 'glasswork',
    label: '玻璃与窑火',
    family: 'craft',
    brief: '从吹制、退火、窑炉里取词',
    device:
      'Take a term from glassblowing, kilnwork, or ceramics and use it as the name. The vocabulary of heat, cooling and fragility is rich and unclaimed.',
    lexicon: [
      'gather (molten glass collected on a pipe)', 'marver (steel table for rolling)', 'punty (solid rod holding the piece)',
      'lehr (annealing oven)', 'frit (pre-fused glass powder)', 'batch (raw mix before melting)',
      'gaffer (lead glassblower)', 'anneal (slow cooling to relieve stress)', 'cullet (recycled broken glass)',
      'crown (spun disc of window glass)', 'cane (rod of coloured glass)', 'murrine (patterned cross-section)',
      'slumping (shaping by gravity in a kiln)', 'devitrify (crystallise out of the glassy state)',
      'saggar (protective firing box)', 'bisque (first firing)', 'glaze (vitreous coating)',
      'grog (pre-fired clay added to a body)', 'kiln (firing chamber)', 'wicket (kiln door)',
      'pyrometric cone (heat-work indicator)', 'raku (rapid-fire, thermal-shock technique)',
    ],
  },

  // ─── 自然 ──────────────────────────────────────────────────────────────
  {
    id: 'mycology',
    label: '真菌与地衣',
    family: 'nature',
    brief: '从菌丝、孢子、共生结构里取词',
    device:
      'Take a term from mycology or lichenology and use it as the name. Mycelial vocabulary maps unusually well onto distributed systems without anyone having claimed it.',
    lexicon: [
      'mycelium (the fungal network)', 'hypha (a single filament)', 'rhizomorph (thick conducting strand)',
      'anastomosis (fusion of two hyphae)', 'sporocarp (fruiting body)', 'ascus (spore sac)',
      'basidium (spore-bearing cell)', 'gleba (inner spore mass)', 'peridium (outer wall)',
      'thallus (undifferentiated body)', 'soredium (dispersal packet of a lichen)', 'apothecium (cup-shaped body)',
      'symbiont (partner organism)', 'mycorrhiza (root-fungus partnership)', 'sclerotium (hardened survival mass)',
      'conidium (asexual spore)', 'stipe (stalk)', 'annulus (ring on a stalk)', 'volva (cup at the base)',
      'hymenium (spore-bearing surface)', 'chitin (structural polymer)', 'saprobe (decomposer)',
    ],
  },
  {
    id: 'mineralogy',
    label: '矿物与晶体',
    family: 'nature',
    brief: '从晶体结构、矿物名里取词',
    device:
      'Take a term from mineralogy or crystallography and use it as the name, or coin a plausible new mineral name with the -ite / -ine ending that mineralogy actually uses.',
    lexicon: [
      'cleavage (plane a crystal splits along)', 'habit (characteristic crystal shape)', 'twinning (intergrown crystals)',
      'druse (crust of small crystals)', 'geode (hollow lined with crystals)', 'matrix (host rock)',
      'lustre (way a surface returns light)', 'streak (colour of the powder)', 'inclusion (trapped foreign body)',
      'pleochroism (colour change with viewing angle)', 'lattice (repeating atomic frame)',
      'polymorph (same composition, different structure)', 'vug (small rock cavity)', 'zeolite (porous framework mineral)',
      'schiller (internal sheen)', 'adularescence (floating blue glow)', 'chatoyancy (cat\'s-eye effect)',
      'placer (concentrated loose deposit)', 'gangue (worthless surrounding mineral)', 'lode (vein of ore)',
      'porphyry (large crystals in a fine groundmass)', 'breccia (angular fragments cemented together)',
    ],
  },
  {
    id: 'hydrology',
    label: '水文与河道',
    family: 'nature',
    brief: '从河流、含水层、潮汐里取词',
    device:
      'Take a term from hydrology, fluvial geomorphology, or groundwater science and use it as the name. Avoid the obvious three — stream, flow, river.',
    lexicon: [
      'aquifer (water-bearing rock)', 'thalweg (line of deepest flow)', 'riffle (shallow fast reach)',
      'meander (looping channel)', 'oxbow (cut-off loop)', 'braid (multi-channel reach)',
      'confluence (joining of two flows)', 'watershed (drainage divide)', 'baseflow (groundwater contribution)',
      'hyporheic (gravel zone beneath a stream)', 'levee (raised bank)', 'estuary (tidal river mouth)',
      'karst (dissolved limestone terrain)', 'sinkhole (collapse into a void)', 'artesian (self-pressurised)',
      'seiche (standing wave in an enclosed basin)', 'freshet (seasonal surge)', 'backwater (still side-pool)',
      'weir (low overflow barrier)', 'sluice (controlled gate)', 'culvert (buried channel)',
      'catchment (area draining to a point)', 'percolate (seep through)', 'eddy (circular counter-current)',
    ],
  },
  {
    id: 'entomology',
    label: '昆虫与变态',
    family: 'nature',
    brief: '从虫态、蜂群、蜕变里取词',
    device:
      'Take a term from entomology — especially the vocabulary of metamorphosis and of social insects — and use it as the name.',
    lexicon: [
      'instar (stage between moults)', 'imago (adult form)', 'ecdysis (shedding the cuticle)',
      'pupa (transforming stage)', 'chrysalis (butterfly pupa)', 'nymph (immature form)',
      'eclosion (emergence from the pupa)', 'diapause (suspended development)', 'trophallaxis (mouth-to-mouth exchange)',
      'stridulate (make sound by rubbing)', 'elytron (hardened wing case)', 'ommatidium (unit of a compound eye)',
      'spiracle (breathing pore)', 'propolis (resin used to seal a hive)', 'comb (hexagonal wax structure)',
      'swarm (colony fission)', 'brood (the developing young)', 'forager (worker that provisions)',
      'pheromone (chemical signal)', 'gall (plant growth induced by an insect)', 'exuvia (the cast skin)',
      'chitin (cuticle polymer)',
    ],
  },
  {
    id: 'seismology',
    label: '地震与波传播',
    family: 'nature',
    brief: '从震源、波相、台网里取词',
    device:
      'Take a term from seismology, volcanology, or wave propagation and use it as the name. These words carry a sense of something detected from far away.',
    lexicon: [
      'hypocentre (the origin at depth)', 'epicentre (the point above it)', 'foreshock (precursor event)',
      'aftershock (following event)', 'moho (crust-mantle boundary)', 'phase (an arriving wave type)',
      'arrival (moment a phase is detected)', 'traveltime (propagation duration)', 'attenuation (loss of amplitude)',
      'dispersion (frequency-dependent speed)', 'refraction (bending at a boundary)', 'caustic (focused wave surface)',
      'coda (the decaying tail of a record)', 'tremor (sustained low-amplitude shaking)', 'isoseismal (equal-intensity contour)',
      'shadow zone (region no direct waves reach)', 'tiltmeter (ground-tilt sensor)', 'fumarole (steam vent)',
      'lahar (volcanic mudflow)', 'tephra (ejected fragments)', 'caldera (collapse basin)', 'graben (down-dropped block)',
    ],
  },

  // ─── 器械 ──────────────────────────────────────────────────────────────
  {
    id: 'horology',
    label: '钟表机械',
    family: 'instrument',
    brief: '从擒纵、游丝、走时里取词',
    device:
      'Take a term from horology — the mechanics of clocks and watches — and use it as the name. The escapement vocabulary in particular is precise, physical, and unclaimed.',
    lexicon: [
      'escapement (releases the gear train in steps)', 'detent (a catch that holds)', 'pallet (arm the escape wheel meets)',
      'balance (oscillating wheel)', 'hairspring (returns the balance)', 'remontoire (small rewound reserve)',
      'fusee (cone that equalises mainspring force)', 'mainspring (energy store)', 'arbor (an axle)',
      'pinion (small driving gear)', 'jewel (low-friction bearing)', 'tourbillon (rotating escapement cage)',
      'complication (any function beyond the time)', 'repeater (chimes the time on demand)',
      'isochronism (rate independent of amplitude)', 'beat (one swing of the balance)', 'amplitude (swing angle)',
      'gnomon (the shadow-casting part of a sundial)', 'foliot (early oscillating bar)', 'verge (early escapement shaft)',
      'click (the pawl that stops reverse winding)', 'ratchet (one-way toothed wheel)', 'deadbeat (escapement with no recoil)',
    ],
  },
  {
    id: 'surveying',
    label: '测绘与制图',
    family: 'instrument',
    brief: '从三角测量、基准面、图例里取词',
    device:
      'Take a term from land surveying, geodesy, or cartography and use it as the name. Favour the words for reference points and for the act of fixing a position.',
    lexicon: [
      'benchmark (a fixed reference mark)', 'datum (the reference surface)', 'traverse (a connected survey line)',
      'triangulate (fix a point from two others)', 'baseline (the measured starting line)', 'azimuth (horizontal bearing)',
      'theodolite (angle-measuring instrument)', 'plumb (true vertical)', 'level (true horizontal)',
      'chainage (distance along a line)', 'offset (perpendicular distance)', 'resection (fix your own position from known points)',
      'monument (a permanent marker)', 'meridian (a north-south line)', 'graticule (the lat-long grid)',
      'isoline (a line of equal value)', 'hachure (shading showing slope)', 'relief (the shape of the ground)',
      'projection (flattening a sphere)', 'rhumb (a line of constant bearing)', 'geoid (the true equipotential shape)',
      'cadastre (the register of boundaries)', 'lodestar (the star you steer by)',
    ],
  },
  {
    id: 'optics',
    label: '光学与成像',
    family: 'instrument',
    brief: '从透镜、焦面、干涉里取词',
    device:
      'Take a term from optics, microscopy, or photographic process and use it as the name. Words for what happens at a focal plane are especially good.',
    lexicon: [
      'aperture (the opening admitting light)', 'caustic (the bright envelope of focused rays)', 'vignette (edge falloff)',
      'coma (an off-axis aberration)', 'astigmatism (unequal focus by axis)', 'parallax (apparent shift with viewpoint)',
      'collimate (make rays parallel)', 'diopter (unit of optical power)', 'etalon (a precise interference cavity)',
      'interferometer (instrument comparing wavefronts)', 'fringe (an interference band)', 'moire (pattern from two grids)',
      'speckle (interference granularity)', 'reticle (the crosshair pattern)', 'objective (the front lens group)',
      'condenser (lens concentrating illumination)', 'stop (a limiting aperture)', 'bokeh (the character of out-of-focus light)',
      'latent image (exposed but undeveloped)', 'fixer (bath that makes an image permanent)',
      'halation (light spreading behind the emulsion)', 'pinhole (the simplest lens of all)',
    ],
  },
  {
    id: 'cryptography-old',
    label: '古典密码与信使',
    family: 'instrument',
    brief: '从换位、密表、驿传里取词',
    device:
      'Take a term from pre-computer cryptography, signalling, or courier systems and use it as the name. Avoid modern crypto vocabulary — hash, cipher, key are exhausted.',
    lexicon: [
      'scytale (rod-wound transposition device)', 'nomenclator (codebook of names and phrases)',
      'tableau (the square of shifted alphabets)', 'polyalphabetic (using several alphabets in turn)',
      'null (a meaningless filler symbol)', 'superencipher (encipher an already enciphered text)',
      'crib (a guessed fragment of plaintext)', 'depth (two messages on the same key)', 'indicator (the setting sent in clear)',
      'steganography (hiding that a message exists)', 'cartouche (an enclosing oval)', 'grille (a mask revealing letters)',
      'semaphore (arm-position signalling)', 'heliograph (mirror signalling by sunlight)', 'optical telegraph (tower relay chain)',
      'courier (a carrier of sealed messages)', 'relay (a station passing a message on)', 'pigeonpost (bird-carried dispatch)',
      'seal (the wax proving a letter unopened)', 'dispatch (a sent official message)', 'runner (a person carrying word)',
      'beacon (a fire chain carrying one bit)',
    ],
  },
  {
    id: 'foundry-tools',
    label: '木工与量具',
    family: 'instrument',
    brief: '从刨、规、卡尺、夹具里取词',
    device:
      'Take the name of a hand tool or measuring instrument from woodworking or the machine shop and use it as the name. Concrete objects that sit in a hand.',
    lexicon: [
      'spokeshave (a small two-handled plane)', 'jointer (plane that makes an edge true)', 'scribe (tool that marks a line)',
      'gauge (tool that sets a distance)', 'caliper (jaws measuring across)', 'micrometer (fine screw measure)',
      'vernier (auxiliary scale reading fractions)', 'jig (fixture that guides a cut)', 'fence (guide the work runs along)',
      'chamfer (a bevelled edge)', 'rabbet (a stepped recess)', 'dado (a cross-grain groove)',
      'dovetail (an interlocking joint)', 'kerf (the slot a saw removes)', 'shim (a thin packing piece)',
      'clamp (holds work under pressure)', 'awl (a piercing point)', 'burin (an engraving cutter)',
      'burr (a raised edge left by cutting)', 'square (checks a right angle)', 'bevel (an adjustable angle gauge)',
      'trammel (beam compass for large arcs)', 'brace (a cranked drill handle)', 'auger (a helical boring bit)',
    ],
  },

  // ─── 构词 ──────────────────────────────────────────────────────────────
  {
    id: 'blend',
    label: '混成词',
    family: 'formation',
    brief: '把两个词咬合成一个',
    device:
      'Make a portmanteau: overlap two words at a shared sound so the seam disappears. Instagram (instant + telegram) and Heroku (heroic + haiku) are the register. The overlap must be real — do not simply concatenate.',
    lexicon: [
      'overlap at a shared syllable, not at a hyphen',
      'one source word should come from the project domain',
      'the other should come from somewhere unrelated',
      'the result should be readable as a single word',
      'two or three syllables reads best',
      'if you have to explain the seam, the seam is in the wrong place',
    ],
  },
  {
    id: 'respell',
    label: '刻意错拼',
    family: 'formation',
    brief: '把一个真词拼错，拼出唯一性',
    device:
      'Take a real word and respell it deliberately so it becomes globally unique while still reading aloud as the original. Google (googol), Clojure (closure), Disqus (discuss), Flickr (flicker). The misspelling should feel intentional, not like a typo.',
    lexicon: [
      'substitute a letter that keeps the sound (c→k, s→z, ph→f)',
      'drop a silent vowel',
      'double a consonant that was single',
      'swap a digraph for its phonetic equivalent',
      'the respelling can smuggle in an initial or a reference',
      'a reader should never be unsure how to pronounce it',
    ],
  },
  {
    id: 'clipping',
    label: '截断',
    family: 'formation',
    brief: '砍掉一个长词的大半，留下能立住的部分',
    device:
      'Clip a longer word or phrase down to a short standalone name. Prolog (programmation en logique), Decap (decapitated), ClickHouse (clickstream data warehouse). The clipped remainder must be pronounceable and must not read as an abbreviation.',
    lexicon: [
      'clip from the front and keep the head',
      'clip from the back and keep the tail',
      'clip a phrase to its first syllables',
      'clip across a word boundary to make a new shape',
      'stop at a syllable boundary, never mid-cluster',
      'the source phrase should be worth quoting in the rationale',
    ],
  },
  {
    id: 'affixation',
    label: '缀化',
    family: 'formation',
    brief: '给一个词根挂上一个后缀',
    device:
      'Attach a derivational affix to a base. Use whatever affix fits — agentive -er, -ist, -ary, -arium, -ery, -ance, -ade, or the productive startup affixes -ify / -ly / -r. The corpus finds no evidence that developers dislike any of these; pick by sound.',
    lexicon: [
      '-ary / -arium (a place where something is kept)',
      '-ery / -age (the practice or the collective)',
      '-wright (one who makes)',
      '-smith (one who works a material)',
      '-ade (the product of an action)',
      '-ance / -ence (the state of)',
      '-ist / -eur (one who does)',
      '-ify / -ly / -r (the modern productive set)',
      '-let / -ule (the small version)',
      '-scope / -graph / -meter (instrument endings)',
    ],
  },
  {
    id: 'compound-collide',
    label: '异域复合',
    family: 'formation',
    brief: '把两个互不相干领域的词直接撞在一起',
    device:
      'Compound two ordinary English words drawn from two unrelated domains, so the pair is concrete but the combination has never existed. Heartbleed, Great Firewall, quick-scope. The collision should be vivid and instantly picturable.',
    lexicon: [
      'one word from a physical trade, one from an abstract domain',
      'one word from weather, one from architecture',
      'one word from anatomy, one from navigation',
      'one word from cooking, one from mathematics',
      'one word from geology, one from music',
      'keep both parts monosyllabic if you can',
    ],
  },
  {
    id: 'acronym-word',
    label: '首字母成词',
    family: 'formation',
    brief: '先想出一个词，再倒推它的展开式',
    device:
      'Invent a short pronounceable word first, then reverse-engineer an expansion whose initials spell it and which actually describes the project. Bash, GIMP, grep. The word must be sayable as a word, never spelled out letter by letter.',
    lexicon: [
      'the expansion must be honest about what the project does',
      'the word should already mean something on its own',
      'four to six letters',
      'a backronym that reads as a joke is acceptable and often better',
      'never produce an initialism that has to be spelled out',
    ],
  },

  // ─── 语言 ──────────────────────────────────────────────────────────────
  {
    id: 'loanword',
    label: '冷门语言借词',
    family: 'tongue',
    brief: '从使用者较少的语言里借一个词',
    device:
      'Borrow a real word from a language that is under-represented in software naming, and pick one whose meaning connects to the project. Give the source language and the literal meaning in the rationale. The word must be spellable in plain ASCII and guessable to read aloud.',
    lexicon: [
      'Icelandic', 'Hungarian', 'Basque', 'Finnish', 'Welsh', 'Estonian',
      'Malay', 'Swahili', 'Quechua', 'Tagalog', 'Georgian', 'Maltese',
      'Yoruba', 'Nahuatl', 'Faroese', 'Romanian', 'Maori', 'Amharic',
      'Sámi', 'Catalan', 'Breton', 'Tamil', 'Mongolian', 'Cornish',
    ],
  },
  {
    id: 'obsolete-english',
    label: '废弃英语词',
    family: 'tongue',
    brief: '从已经死掉的英语词里捡一个回来',
    device:
      'Revive an obsolete or dialectal English word. It must be a real word with a citable historical sense — being obsolete is exactly what makes it globally unique now.',
    lexicon: [
      'apricity (the warmth of the sun in winter)', 'petrichor (the smell of rain on dry earth)',
      'gloaming (twilight)', 'snickersnee (a large knife; a fight with one)', 'uhtceare (lying awake before dawn with worry)',
      'sillage (the trace a scent leaves behind)', 'fettle (condition, order)', 'thole (to endure)',
      'lich (a body; a gate for bearing one)', 'wend (to go)', 'rede (counsel, to advise)',
      'tarn (a small mountain lake)', 'ken (range of knowledge or sight)', 'haar (cold sea fog)',
      'scrying (seeing by gazing into a surface)', 'wight (a living being)', 'quern (a hand mill)',
      'withy (a flexible willow rod)', 'garth (an enclosed yard)', 'staithe (a landing stage)',
      'hoard (a buried store)', 'leat (an artificial watercourse)', 'shieling (a summer hut)',
      'clepsydra (a water clock)',
    ],
  },
  {
    id: 'literary',
    label: '文学典故',
    family: 'tongue',
    brief: '从一部具体作品里取一个专名',
    device:
      'Borrow a proper name from a specific literary work, myth, or philosophical text — a minor character, a place, an object. Polonius, Moby, Kafka. Name the source in the rationale. Avoid the exhausted layer: Prometheus, Odyssey, Atlas, Phoenix, Hermes, Janus, Argo.',
    lexicon: [
      'a minor character rather than a protagonist',
      'an object or artefact from the work',
      'a place name from the work',
      'a coined word the author invented',
      'a figure from a non-Western canon',
      'a name from a pre-modern technical or philosophical text',
    ],
  },
  {
    id: 'jargon-borrow',
    label: '行业黑话挪用',
    family: 'tongue',
    brief: '从一个和软件无关的行当里偷一句行话',
    device:
      'Steal a piece of workplace slang from a trade that has nothing to do with software — kitchens, theatre, aviation, fishing, railways, print, medicine, tailoring — and use it as the name. It must be genuine in-group vocabulary, not the public-facing word.',
    lexicon: [
      'kitchen: mise en place, pass, fire, in the weeds, sandbag, plate',
      'theatre: strike, cue, green room, fly, ghost light, blocking, prompt',
      'aviation: rotate, feather, deadstick, holdshort, squawk, trim',
      'railway: consist, deadhead, wye, frog, gauntlet, shunt, clearance',
      'fishing: longline, trawl, weir, creel, bycatch, haul, set',
      'tailoring: baste, dart, interlining, ease, grainline, toile, press',
      'medicine: triage, bolus, titrate, rounds, vitals, workup',
      'radio: patch, bleed, cue, dead air, pot, feed',
    ],
  },
  {
    id: 'mathematics',
    label: '数学冷僻术语',
    family: 'tongue',
    brief: '从数学与逻辑的边角术语里取词',
    device:
      'Take a term from mathematics or logic that is real but not famous, and use it as the name. Avoid the exhausted ones: vector, matrix, tensor, lambda, sigma, delta, graph, tree.',
    lexicon: [
      'lemniscate (the figure-eight curve)', 'involute (curve traced by unwinding a string)',
      'evolute (the locus of centres of curvature)', 'cusp (a point where a curve reverses)',
      'nomogram (a chart that computes by alignment)', 'quadrature (finding an area)',
      'lemma (a step proved on the way)', 'corollary (what follows immediately)',
      'residue (what a function leaves at a pole)', 'sheaf (data attached consistently to open sets)',
      'germ (the local behaviour at a point)', 'stalk (all the germs at one point)',
      'filtration (an increasing family of subobjects)', 'ultrafilter (a maximal consistent selection)',
      'coproduct (the dual of a product)', 'adjoint (a canonical partner construction)',
      'idempotent (unchanged when applied twice)', 'nilpotent (vanishes when raised to a power)',
      'catenary (the hanging-chain curve)', 'brachistochrone (the fastest-descent curve)',
      'simplex (the simplest cell of a dimension)', 'holonomy (what a loop does to a carried frame)',
      'monodromy (how a solution changes around a loop)', 'zeugma (the yoking of two by one)',
    ],
  },
]

export const STRATEGY_BY_ID = new Map(STRATEGIES.map(s => [s.id, s]))
export const FAMILY_BY_ID = new Map(FAMILIES.map(f => [f.id, f]))
