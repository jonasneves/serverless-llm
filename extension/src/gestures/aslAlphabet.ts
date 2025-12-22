/**
 * ASL Alphabet Gesture Definitions
 * 
 * Based on the handsign-tensorflow project (https://github.com/syauqy/handsign-tensorflow)
 * Uses fingerpose library to define hand poses for ASL fingerspelling alphabet.
 * 
 * Each gesture is defined by:
 * - Finger curl states (NoCurl, HalfCurl, FullCurl)
 * - Finger directions (Up, Down, Left, Right, etc.)
 * 
 * Note: J and Z are dynamic gestures (require motion) and are approximated here
 * as their static start positions.
 */

import { Finger, FingerCurl, FingerDirection, GestureDescription } from 'fingerpose';

// ============================================
// ASL Letter: A
// Fist with thumb alongside
// ============================================
const aSign = new GestureDescription('A');
// Thumb
aSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
aSign.addDirection(Finger.Thumb, FingerDirection.VerticalUp, 0.75);
// All other fingers curled
aSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
aSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
aSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
aSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: B
// Flat hand, fingers up, thumb across palm
// ============================================
const bSign = new GestureDescription('B');
// All fingers extended up
aSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
bSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
bSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
bSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
bSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
bSign.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
bSign.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.75);
bSign.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
bSign.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.75);
// Thumb curled across palm
bSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);

// ============================================
// ASL Letter: C
// Curved hand like holding a cup
// ============================================
const cSign = new GestureDescription('C');
// All fingers half curled in C shape
cSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
cSign.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 0.75);
cSign.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
cSign.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
cSign.addCurl(Finger.Ring, FingerCurl.HalfCurl, 1.0);
cSign.addCurl(Finger.Pinky, FingerCurl.HalfCurl, 1.0);

// ============================================
// ASL Letter: D
// Index up, other fingers touch thumb
// ============================================
const dSign = new GestureDescription('D');
// Index extended
dSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
dSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
// Other fingers curled to meet thumb
dSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
dSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
dSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
dSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: E
// Fingers curled over thumb
// ============================================
const eSign = new GestureDescription('E');
// All fingers half curled
eSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
eSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
eSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
eSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb tucked under fingers
eSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);

// ============================================
// ASL Letter: F
// OK sign - thumb and index touching, others extended
// ============================================
const fSign = new GestureDescription('F');
// Index and thumb form circle
fSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.8);
fSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
// Other fingers extended
fSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
fSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
fSign.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
fSign.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.75);
fSign.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
fSign.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.75);

// ============================================
// ASL Letter: G
// Pointing sideways with thumb parallel
// ============================================
const gSign = new GestureDescription('G');
// Index pointing horizontally
gSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
gSign.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.75);
gSign.addDirection(Finger.Index, FingerDirection.HorizontalRight, 0.75);
// Thumb parallel to index
gSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
gSign.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 0.5);
gSign.addDirection(Finger.Thumb, FingerDirection.HorizontalRight, 0.5);
// Other fingers curled
gSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
gSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
gSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: H
// Index and middle pointing sideways
// ============================================
const hSign = new GestureDescription('H');
// Index and middle pointing horizontally
hSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
hSign.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.75);
hSign.addDirection(Finger.Index, FingerDirection.HorizontalRight, 0.75);
hSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
hSign.addDirection(Finger.Middle, FingerDirection.HorizontalLeft, 0.75);
hSign.addDirection(Finger.Middle, FingerDirection.HorizontalRight, 0.75);
// Other fingers curled
hSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
hSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
hSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: I
// Pinky up, others curled
// ============================================
const iSign = new GestureDescription('I');
// Pinky extended
iSign.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
iSign.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.75);
// Other fingers curled
iSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
iSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
iSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
iSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: J
// Same as I but with motion (static approximation)
// ============================================
const jSign = new GestureDescription('J');
// Pinky extended
jSign.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
jSign.addDirection(Finger.Pinky, FingerDirection.DiagonalUpRight, 0.5);
jSign.addDirection(Finger.Pinky, FingerDirection.DiagonalUpLeft, 0.5);
// Other fingers curled
jSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
jSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
jSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
jSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: K
// Index and middle up, separated, thumb between
// ============================================
const kSign = new GestureDescription('K');
// Index extended up
kSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
kSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
// Middle extended up
kSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
kSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
// Thumb between index and middle
kSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.75);
// Other fingers curled
kSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
kSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: L
// L shape with thumb and index
// ============================================
const lSign = new GestureDescription('L');
// Index up
lSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
lSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
// Thumb out to side
lSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
lSign.addDirection(Finger.Thumb, FingerDirection.HorizontalLeft, 0.5);
lSign.addDirection(Finger.Thumb, FingerDirection.HorizontalRight, 0.5);
// Other fingers curled
lSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
lSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
lSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: M
// Three fingers over thumb
// ============================================
const mSign = new GestureDescription('M');
// Index, middle, ring curled over thumb
mSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
mSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
mSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
// Pinky curled
mSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb under fingers
mSign.addCurl(Finger.Thumb, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: N
// Two fingers over thumb
// ============================================
const nSign = new GestureDescription('N');
// Index and middle curled over thumb
nSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
nSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
// Ring and pinky curled
nSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
nSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb under index and middle
nSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: O
// All fingertips touching thumb (O shape)
// ============================================
const oSign = new GestureDescription('O');
// All fingers curved to meet thumb
oSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
oSign.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
oSign.addCurl(Finger.Middle, FingerCurl.HalfCurl, 1.0);
oSign.addCurl(Finger.Ring, FingerCurl.HalfCurl, 1.0);
oSign.addCurl(Finger.Pinky, FingerCurl.HalfCurl, 1.0);

// ============================================
// ASL Letter: P
// Like K but pointing down
// ============================================
const pSign = new GestureDescription('P');
// Index pointing down/forward
pSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
pSign.addDirection(Finger.Index, FingerDirection.DiagonalDownLeft, 0.5);
pSign.addDirection(Finger.Index, FingerDirection.DiagonalDownRight, 0.5);
// Middle extended
pSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
pSign.addDirection(Finger.Middle, FingerDirection.VerticalDown, 0.5);
// Thumb out
pSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.75);
// Other fingers curled
pSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
pSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: Q
// Like G but pointing down
// ============================================
const qSign = new GestureDescription('Q');
// Index pointing down
qSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
qSign.addDirection(Finger.Index, FingerDirection.VerticalDown, 0.75);
// Thumb parallel to index, pointing down
qSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
qSign.addDirection(Finger.Thumb, FingerDirection.VerticalDown, 0.5);
// Other fingers curled
qSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
qSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
qSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: R
// Crossed index and middle fingers
// ============================================
const rSign = new GestureDescription('R');
// Index and middle extended and crossed
rSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
rSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
rSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
rSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
// Other fingers curled
rSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
rSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
rSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: S
// Fist with thumb over fingers
// ============================================
const sSign = new GestureDescription('S');
// All fingers curled into fist
sSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
sSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
sSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
sSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb over fingers (not alongside like A)
sSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);

// ============================================
// ASL Letter: T
// Thumb between index and middle
// ============================================
const tSign = new GestureDescription('T');
// All fingers curled
tSign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
tSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
tSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
tSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb sticking out between index and middle
tSign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.75);

// ============================================
// ASL Letter: U
// Index and middle together pointing up
// ============================================
const uSign = new GestureDescription('U');
// Index and middle extended together
uSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
uSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
uSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
uSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
// Other fingers curled
uSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
uSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
uSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: V
// Victory sign - index and middle spread
// ============================================
const vSign = new GestureDescription('V');
// Index and middle extended and spread
vSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
vSign.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 0.5);
vSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.5);
vSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
vSign.addDirection(Finger.Middle, FingerDirection.DiagonalUpRight, 0.5);
vSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.5);
// Other fingers curled
vSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
vSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
vSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: W
// Index, middle, and ring extended and spread
// ============================================
const wSign = new GestureDescription('W');
// Three fingers extended
wSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
wSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
wSign.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
wSign.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
wSign.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
wSign.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.75);
// Pinky curled
wSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
// Thumb curled
wSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: X
// Index hooked (half curl)
// ============================================
const xSign = new GestureDescription('X');
// Index half curled (hooked)
xSign.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
xSign.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.5);
// Other fingers curled
xSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
xSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
xSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
xSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// ASL Letter: Y
// Thumb and pinky extended (hang loose)
// ============================================
const ySign = new GestureDescription('Y');
// Thumb extended out
ySign.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
ySign.addDirection(Finger.Thumb, FingerDirection.DiagonalUpLeft, 0.5);
ySign.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 0.5);
// Pinky extended
ySign.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
ySign.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.5);
ySign.addDirection(Finger.Pinky, FingerDirection.DiagonalUpRight, 0.5);
// Other fingers curled
ySign.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
ySign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
ySign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);

// ============================================
// ASL Letter: Z
// Index traces Z shape (static approximation)
// ============================================
const zSign = new GestureDescription('Z');
// Index pointing (will trace Z in motion)
zSign.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
zSign.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 0.5);
zSign.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 0.5);
// Other fingers curled
zSign.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
zSign.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
zSign.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
zSign.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// ============================================
// Control Gestures (for ASL mode UI control)
// ============================================

// SEND: Thumbs up - confirms and sends the buffer
const sendGesture = new GestureDescription('SEND');
sendGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
sendGesture.addDirection(Finger.Thumb, FingerDirection.VerticalUp, 0.9);
sendGesture.addCurl(Finger.Index, FingerCurl.FullCurl, 1.0);
sendGesture.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
sendGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
sendGesture.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// CLEAR: Open palm with fingers spread - clears the buffer
const clearGesture = new GestureDescription('CLEAR');
clearGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.8);
clearGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
clearGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.7);
clearGesture.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
clearGesture.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.7);
clearGesture.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
clearGesture.addDirection(Finger.Ring, FingerDirection.VerticalUp, 0.7);
clearGesture.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
clearGesture.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.7);

// SPACE: Flat hand pointing sideways - adds a space
const spaceGesture = new GestureDescription('SPACE');
spaceGesture.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.8);
spaceGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
spaceGesture.addDirection(Finger.Index, FingerDirection.HorizontalRight, 0.5);
spaceGesture.addDirection(Finger.Index, FingerDirection.HorizontalLeft, 0.5);
spaceGesture.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
spaceGesture.addDirection(Finger.Middle, FingerDirection.HorizontalRight, 0.5);
spaceGesture.addDirection(Finger.Middle, FingerDirection.HorizontalLeft, 0.5);
spaceGesture.addCurl(Finger.Ring, FingerCurl.NoCurl, 1.0);
spaceGesture.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);

// BACKSPACE: Pinch gesture (thumb and index together) - deletes last letter
const backspaceGesture = new GestureDescription('BACKSPACE');
backspaceGesture.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 1.0);
backspaceGesture.addCurl(Finger.Index, FingerCurl.HalfCurl, 1.0);
backspaceGesture.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
backspaceGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
backspaceGesture.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// PREV_MODE: Victory/Peace sign (✌️) - switches to previous mode
const prevModeGesture = new GestureDescription('PREV_MODE');
prevModeGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
prevModeGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
prevModeGesture.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
prevModeGesture.addDirection(Finger.Middle, FingerDirection.VerticalUp, 0.75);
prevModeGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
prevModeGesture.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);
prevModeGesture.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.75);

// NEXT_MODE: I Love You sign (🤟) - switches to next mode
const nextModeGesture = new GestureDescription('NEXT_MODE');
nextModeGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
nextModeGesture.addDirection(Finger.Thumb, FingerDirection.DiagonalUpLeft, 0.5);
nextModeGesture.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 0.5);
nextModeGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
nextModeGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.75);
nextModeGesture.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
nextModeGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
nextModeGesture.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
nextModeGesture.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.75);

// ============================================
// Export all ASL gestures
// ============================================
export const ASL_ALPHABET: GestureDescription[] = [
  aSign, bSign, cSign, dSign, eSign, fSign, gSign, hSign,
  iSign, jSign, kSign, lSign, mSign, nSign, oSign, pSign,
  qSign, rSign, sSign, tSign, uSign, vSign, wSign, xSign,
  ySign, zSign
];

// Control gestures for ASL mode (send, clear, space, backspace, mode switching)
export const ASL_CONTROLS: GestureDescription[] = [
  sendGesture, clearGesture, spaceGesture, backspaceGesture,
  prevModeGesture, nextModeGesture
];

// All gestures combined (letters + controls)
export const ASL_ALL_GESTURES: GestureDescription[] = [
  ...ASL_ALPHABET,
  ...ASL_CONTROLS
];

// Map gesture name to letter/action for display
export const ASL_GESTURE_MAP: Record<string, string> = {
  'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D', 'E': 'E',
  'F': 'F', 'G': 'G', 'H': 'H', 'I': 'I', 'J': 'J',
  'K': 'K', 'L': 'L', 'M': 'M', 'N': 'N', 'O': 'O',
  'P': 'P', 'Q': 'Q', 'R': 'R', 'S': 'S', 'T': 'T',
  'U': 'U', 'V': 'V', 'W': 'W', 'X': 'X', 'Y': 'Y',
  'Z': 'Z',
  'SEND': '✓ Send',
  'CLEAR': '✕ Clear',
  'SPACE': '␣ Space',
  'BACKSPACE': '⌫ Delete',
  'PREV_MODE': '✌️ Prev Mode',
  'NEXT_MODE': '🤟 Next Mode'
};

// Check if a gesture is a control gesture (not a letter)
export const isControlGesture = (name: string): boolean => {
  return ['SEND', 'CLEAR', 'SPACE', 'BACKSPACE', 'PREV_MODE', 'NEXT_MODE'].includes(name);
};

export default ASL_ALL_GESTURES;

