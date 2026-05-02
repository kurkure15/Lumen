import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import { getSvgPath } from 'figma-squircle';

const FONT_STACK =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const CURSOR_LIT = '#5a58b8';
const CURSOR_DIM = '#3d3c7a';
const CURSOR_OFF = '#ffffff';
const TEXT_COLOR = '#8E8BFF';
const TEXT_OFF_COLOR = '#a3a3a3';
const PADDING_LEFT = 16;
const CONTAINER_WIDTH = 376;
const CONTAINER_HEIGHT = 56;
const CORNER_RADIUS = 12;
const BORDER_COLOR = '#A3A3A3';
const BORDER_WIDTH = 0.8;
const FILL_COLOR = '#08090A';
const BORDER_INSET_SHADOW = 'inset 0 0 0 1px rgba(255,255,255,0.08)';
// Beam dark-stop matches FILL_COLOR so the trail fades into the input bg.
const BEAM_DARK_STOP = '#08090A';

const SQUIRCLE_PATH = getSvgPath({
  width: CONTAINER_WIDTH,
  height: CONTAINER_HEIGHT,
  cornerRadius: CORNER_RADIUS,
  cornerSmoothing: 1,
});

// Inset path for the stroked border: SVG strokes are centered on the path, so
// drawing on the container's outer edge means half the stroke is clipped by the
// SVG viewBox on straight edges (showing ~0.5px) but fully renders at corners
// (showing 1px) — making corners look thicker. Insetting the path by half the
// stroke width keeps the whole stroke inside the viewBox and uniform.
const SQUIRCLE_BORDER_PATH = getSvgPath({
  width: CONTAINER_WIDTH - BORDER_WIDTH,
  height: CONTAINER_HEIGHT - BORDER_WIDTH,
  cornerRadius: CORNER_RADIUS - BORDER_WIDTH / 2,
  cornerSmoothing: 1,
});

// Beam geometry — the SVG viewBox is 122 wide × 56 tall, with the visible path
// running from x=8 to x=113.334 (path bbox 105.334 × 46.503 — the dimensions
// from the latest Figma export). We anchor the path's bright (right, narrow)
// edge at the cursor and let the beam grow from zero width up to the path's
// full visible width as the user types.
const BEAM_SVG_WIDTH = 122;
const BEAM_HEIGHT = 56;
const BEAM_PATH_RIGHT = 113.334;
const BEAM_FULL_WIDTH = 105.334; // bright-end x minus dark-end x of the path
const BEAM_ORIGIN_PCT = (BEAM_PATH_RIGHT / BEAM_SVG_WIDTH) * 100;

// How wide the lit area is behind the cursor.
//   CHAR_LIT_RADIUS  — chars within this many px of the cursor are fully lit
//   CHAR_FADE_END    — chars past this many px are fully dark (invisible)
//   Between the two, opacity falls off linearly.
// Lower both numbers to make fewer characters visible at once.
const CHAR_LIT_RADIUS = 30;
const CHAR_FADE_END = 70;

const computeOpacity = (dist: number) => {
  if (dist <= CHAR_LIT_RADIUS) return 1;
  if (dist >= CHAR_FADE_END) return 0;
  return 1 - (dist - CHAR_LIT_RADIUS) / (CHAR_FADE_END - CHAR_LIT_RADIUS);
};

// Char opacity: hidden if at or past the cursor's *target* (snaps immediately,
// without waiting for the spring to catch up); otherwise distance-based fall-off
// behind the spring's current position so the trail glides smoothly.
// When the toggle is off, everything reads at full opacity.
const computeCharOpacity = (
  charX: number,
  cursorPos: number,
  targetPos: number,
  on: boolean
) => {
  if (!on) return '1';
  if (charX >= targetPos) return '0';
  return String(computeOpacity(cursorPos - charX));
};

type UserChar = { id: string; char: string; x: number };

export default function FlashlightInput() {
  const reduced = useReducedMotion() ?? false;

  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const charRefs = useRef<Map<string, { el: HTMLSpanElement; x: number }>>(
    new Map()
  );
  const breatheTimer = useRef<number | null>(null);
  const dimTimer = useRef<number | null>(null);
  const nextId = useRef(0);

  const [value, setValue] = useState('');
  const [chars, setChars] = useState<UserChar[]>([]);
  const [breathing, setBreathing] = useState(false);
  const [cursorDim, setCursorDim] = useState(false);
  const [lightOn, setLightOn] = useState(true);
  const lightOnRef = useRef(lightOn);
  useEffect(() => {
    lightOnRef.current = lightOn;
  }, [lightOn]);

  const targetX = useMotionValue(0);
  const springX = useSpring(targetX, {
    stiffness: 900,
    damping: 45,
    mass: 0.4,
  });
  const cursorX = reduced ? targetX : springX;

  // Beam grows from 0 → 1 as the cursor moves out from the start, capped at full width.
  const beamScale = useTransform(cursorX, (x) =>
    Math.min(Math.max(x, 0) / BEAM_FULL_WIDTH, 1)
  );

  const measureX = useCallback((text: string) => {
    const el = measureRef.current;
    if (!el) return 0;
    el.textContent = text;
    return el.getBoundingClientRect().width;
  }, []);

  useMotionValueEvent(cursorX, 'change', (latest) => {
    const target = targetX.get();
    charRefs.current.forEach(({ el, x }) => {
      el.style.opacity = computeCharOpacity(
        x,
        latest,
        target,
        lightOnRef.current
      );
    });
  });

  // When the light toggle flips, immediately re-apply opacities (don't wait for cursor motion).
  useEffect(() => {
    const latest = cursorX.get();
    const target = targetX.get();
    charRefs.current.forEach(({ el, x }) => {
      el.style.opacity = computeCharOpacity(x, latest, target, lightOn);
    });
  }, [lightOn, cursorX, targetX]);

  const syncCursor = useCallback(() => {
    if (!inputRef.current) return;
    const start = inputRef.current.selectionStart ?? 0;
    const end = inputRef.current.selectionEnd ?? 0;
    // During an active selection (e.g. after Ctrl+A or shift-arrow), don't
    // jump the visual cursor — leave it where the user last placed it.
    if (start !== end) return;
    targetX.set(measureX(inputRef.current.value.substring(0, end)));
  }, [measureX, targetX]);

  const armBreathing = useCallback(() => {
    if (reduced) return;
    if (breatheTimer.current !== null) clearTimeout(breatheTimer.current);
    setBreathing(false);
    breatheTimer.current = window.setTimeout(() => {
      if (document.activeElement === inputRef.current) {
        setBreathing(true);
      }
    }, 800);
  }, [reduced]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.currentTarget.value;
    if (newValue.length > value.length) {
      const added: UserChar[] = [];
      for (let i = value.length; i < newValue.length; i++) {
        added.push({
          id: `c${nextId.current++}`,
          char: newValue[i],
          x: measureX(newValue.substring(0, i)),
        });
      }
      setChars((prev) => [...prev, ...added]);
    } else if (newValue.length < value.length) {
      const removeCount = value.length - newValue.length;
      setChars((prev) => prev.slice(0, prev.length - removeCount));
    }
    setValue(newValue);
    requestAnimationFrame(syncCursor);
    armBreathing();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !reduced) {
      setCursorDim(true);
      if (dimTimer.current !== null) clearTimeout(dimTimer.current);
      dimTimer.current = window.setTimeout(() => setCursorDim(false), 200);
    }
    armBreathing();
  };

  const handleKeyUp = () => {
    requestAnimationFrame(syncCursor);
  };

  const handleClick = () => {
    requestAnimationFrame(syncCursor);
  };

  const handleFocus = () => {
    armBreathing();
  };

  const handleBlur = () => {
    if (breatheTimer.current !== null) clearTimeout(breatheTimer.current);
    setBreathing(false);
  };

  useEffect(() => {
    inputRef.current?.focus();
    armBreathing();
    return () => {
      if (breatheTimer.current !== null) clearTimeout(breatheTimer.current);
      if (dimTimer.current !== null) clearTimeout(dimTimer.current);
    };
  }, [armBreathing]);

  const registerChar =
    (id: string, x: number) => (el: HTMLSpanElement | null) => {
      if (el) {
        charRefs.current.set(id, { el, x });
        el.style.opacity = computeCharOpacity(
          x,
          cursorX.get(),
          targetX.get(),
          lightOn
        );
      } else {
        charRefs.current.delete(id);
      }
    };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div
        style={{
          position: 'relative',
          width: CONTAINER_WIDTH,
          height: CONTAINER_HEIGHT,
        }}
      >
        {/* Clipped content layer — squircle-shaped fill + interactive surface */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: FILL_COLOR,
            boxShadow: BORDER_INSET_SHADOW,
            clipPath: `path('${SQUIRCLE_PATH}')`,
          }}
        >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: PADDING_LEFT,
            right: 0,
          }}
        >
          {/* Glow — Figma "Flashlight" beam, mirrored so the bright edge sits
              at the cursor and the glow trails leftward over already-typed
              text. The cursor wrapper handles X follow + slow on/off fade.
              The inner wrapper handles the progressive width via scaleX
              (anchored at the bright-edge origin so the right edge stays put)
              and the quick presence fade tied to chars.length > 0. */}
          <motion.div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              x: cursorX,
              opacity: lightOn ? 1 : 0,
              transition: 'opacity 700ms cubic-bezier(0.215, 0.61, 0.355, 1)',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              className={
                breathing && chars.length > 0 ? 'flashlight-breathe' : ''
              }
              style={{
                position: 'absolute',
                top: '50%',
                left: -BEAM_PATH_RIGHT,
                width: BEAM_SVG_WIDTH,
                height: BEAM_HEIGHT,
                y: '-50%',
                scaleX: beamScale,
                transformOrigin: `${BEAM_ORIGIN_PCT}% 50%`,
                opacity: chars.length > 0 ? 1 : 0,
                transition:
                  'opacity 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
              }}
            >
              <svg
                width={BEAM_SVG_WIDTH}
                height={BEAM_HEIGHT}
                viewBox="0 0 122 56"
                preserveAspectRatio="none"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block', overflow: 'visible' }}
              >
                <g filter="url(#flashlight-blur)">
                  {/* Latest Figma export — already mirrored: narrow source on
                      the right (cursor side), wide end fanning to the left. */}
                  <path
                    d="M113.334 12.0324L8.57784 3.7251L8 50.2283L113.334 43.7368V12.0324Z"
                    fill="url(#flashlight-grad)"
                    fillOpacity="0.3"
                  />
                </g>
                <defs>
                  <filter
                    id="flashlight-blur"
                    x="-20"
                    y="-20"
                    width="162"
                    height="96"
                    filterUnits="userSpaceOnUse"
                    colorInterpolationFilters="sRGB"
                  >
                    <feGaussianBlur stdDeviation="4" />
                  </filter>
                  {/* Latest Figma gradient — bright at right (cursor), fading
                      to dark going left. Matches CSS spec:
                        linear-gradient(90deg,
                          rgba(142,139,255,0.30) -14.03%,
                          rgba(10,10,27,0.30) 42.48%)
                      mirrored. */}
                  <linearGradient
                    id="flashlight-grad"
                    x1="128.11"
                    y1="26.9767"
                    x2="-6.31431"
                    y2="26.9767"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#8E8BFF" />
                    <stop offset="0.442757" stopColor={BEAM_DARK_STOP} />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>
          </motion.div>

          {/* Text layer */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              fontFamily: FONT_STACK,
              fontSize: 16,
              fontWeight: 500,
              color: lightOn ? TEXT_COLOR : TEXT_OFF_COLOR,
              transition: 'color 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
              pointerEvents: 'none',
            }}
          >
            <AnimatePresence mode="popLayout">
              {chars.map((c) => (
                <motion.span
                  key={c.id}
                  ref={registerChar(c.id, c.x)}
                  exit={
                    reduced
                      ? { opacity: 0, transition: { duration: 0 } }
                      : { opacity: 0, transition: { duration: 0.12 } }
                  }
                  style={{
                    position: 'absolute',
                    left: c.x,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    whiteSpace: 'pre',
                  }}
                >
                  {c.char}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          {/* Cursor */}
          <motion.div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              x: cursorX,
              pointerEvents: 'none',
            }}
          >
            <div
              className={breathing ? 'flashlight-breathe' : ''}
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                width: 2,
                height: 32,
                transform: 'translateY(-50%)',
                background: !lightOn
                  ? CURSOR_OFF
                  : cursorDim
                    ? CURSOR_DIM
                    : CURSOR_LIT,
                transition:
                  'background-color 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
                borderRadius: 4,
              }}
            />
          </motion.div>

          {/* Real input — owns text state, visually hidden */}
          <input
            ref={inputRef}
            className="flashlight-input"
            type="text"
            aria-label="Describe your issue"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onClick={handleClick}
            onFocus={handleFocus}
            onBlur={handleBlur}
            autoComplete="off"
            spellCheck={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              padding: 0,
              margin: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'transparent',
              caretColor: 'transparent',
              fontFamily: FONT_STACK,
              fontSize: 16,
              fontWeight: 500,
            }}
          />

          {/* Hidden measuring span */}
          <span
            ref={measureRef}
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              visibility: 'hidden',
              whiteSpace: 'pre',
              fontFamily: FONT_STACK,
              fontSize: 16,
              fontWeight: 500,
              pointerEvents: 'none',
            }}
          />
        </div>

          {/* Light toggle — flips the flashlight metaphor on/off */}
          <button
            type="button"
            aria-label={lightOn ? 'Turn light off' : 'Turn light on'}
            aria-pressed={lightOn}
            onClick={() => setLightOn((v) => !v)}
            style={{
              position: 'absolute',
              left: 336,
              top: 16,
              width: 24,
              height: 24,
              padding: 0,
              margin: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              outline: 'none',
              color: lightOn ? '#A09DFF' : '#5b5b66',
              transition: 'color 200ms cubic-bezier(0.215, 0.61, 0.355, 1)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: 'block' }}
            >
              <path
                d="M9.80278 18.0861C9.19352 17.4769 8.88889 16.7444 8.88889 15.8889H6.55556C6.12778 15.8889 5.76157 15.7366 5.45694 15.4319C5.15231 15.1273 5 14.7611 5 14.3333C5 12.5185 5.5963 10.9532 6.78889 9.6375C7.98148 8.32176 9.45926 7.56667 11.2222 7.37222V5H12.7778V7.37222C14.5407 7.56667 16.0185 8.32176 17.2111 9.6375C18.4037 10.9532 19 12.5185 19 14.3333C19 14.7611 18.8477 15.1273 18.5431 15.4319C18.2384 15.7366 17.8722 15.8889 17.4444 15.8889H15.1111C15.1111 16.7444 14.8065 17.4769 14.1972 18.0861C13.588 18.6954 12.8556 19 12 19C11.1444 19 10.412 18.6954 9.80278 18.0861ZM6.55556 14.3333H17.4444C17.4444 12.8296 16.913 11.5463 15.85 10.4833C14.787 9.42037 13.5037 8.88889 12 8.88889C10.4963 8.88889 9.21296 9.42037 8.15 10.4833C7.08704 11.5463 6.55556 12.8296 6.55556 14.3333Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        {/* Squircle border — drawn on top so the stroke isn't clipped */}
        <svg
          aria-hidden
          width={CONTAINER_WIDTH}
          height={CONTAINER_HEIGHT}
          viewBox={`0 0 ${CONTAINER_WIDTH} ${CONTAINER_HEIGHT}`}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          <g transform={`translate(${BORDER_WIDTH / 2} ${BORDER_WIDTH / 2})`}>
            <path
              d={SQUIRCLE_BORDER_PATH}
              fill="none"
              stroke={BORDER_COLOR}
              strokeWidth={BORDER_WIDTH}
            />
          </g>
        </svg>
      </div>
    </form>
  );
}
