import React, { useEffect, useState, useRef, useCallback } from 'react';

/**
 * ApplePencilSupport — adds stylus-aware features to the tldraw editor:
 *
 *  1. Eraser-end detection  (button 5 / buttons & 32)
 *  2. Palm rejection         (suppress touch while pen is active)
 *  3. Floating quick-toggle  (tap to swap draw ↔ eraser; appears on pen input)
 *
 * The Apple Pencil's hardware "double-tap" gesture is a native iPadOS API
 * (`UIPencilInteraction`) and is NOT accessible from any web browser.
 * The quick-toggle FAB is the best web-based substitute.
 */
export default function ApplePencilSupport({ editorRef, editorReady }) {
    const [isPenActive, setIsPenActive] = useState(false);
    const [currentTool, setCurrentTool] = useState('draw');
    const [showFab, setShowFab] = useState(false);

    // Track whether the pen is currently in contact so we can reject palm touches
    const penInContactRef = useRef(false);
    // Timer to hide the FAB after inactivity
    const fabTimeoutRef = useRef(null);
    // Store the tool the user was on before eraser-end switched
    const previousToolRef = useRef('draw');

    // ── Reveal the FAB whenever we see pen input, auto-hide after 6s idle ──
    const revealFab = useCallback(() => {
        setShowFab(true);
        if (fabTimeoutRef.current) clearTimeout(fabTimeoutRef.current);
        fabTimeoutRef.current = setTimeout(() => setShowFab(false), 6000);
    }, []);

    // ── Quick-toggle: swap between draw ↔ eraser ──
    const toggleEraser = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const cur = editor.getCurrentToolId();
        if (cur === 'eraser') {
            const target = previousToolRef.current || 'draw';
            editor.setCurrentTool(target);
            setCurrentTool(target);
        } else {
            previousToolRef.current = cur;
            editor.setCurrentTool('eraser');
            setCurrentTool('eraser');
        }
        revealFab();
    }, [editorRef, revealFab]);

    useEffect(() => {
        if (!editorReady) return;
        const editor = editorRef.current;
        if (!editor) return;

        const container = editor.getContainer();
        if (!container) return;

        // ────────────────────────────────────────────
        // 1.  Eraser-end detection
        // ────────────────────────────────────────────
        // When a stylus with eraser button (button 5, bitmask 32) contacts the
        // screen, automatically switch to the eraser tool.  When lifted, switch
        // back to whatever tool was active before.
        const onPointerDown = (e) => {
            if (e.pointerType === 'pen') {
                penInContactRef.current = true;
                setIsPenActive(true);
                revealFab();

                // Eraser end of stylus — button 5 → buttons bitmask has bit 5 set (32)
                if (e.button === 5 || (e.buttons & 32) !== 0) {
                    const cur = editor.getCurrentToolId();
                    if (cur !== 'eraser') {
                        previousToolRef.current = cur;
                    }
                    editor.setCurrentTool('eraser');
                    setCurrentTool('eraser');
                }
            }
        };

        const onPointerUp = (e) => {
            if (e.pointerType === 'pen') {
                penInContactRef.current = false;

                // If we auto-switched to eraser via eraser-end, revert on lift
                if (e.button === 5 || (e.buttons & 32) === 0) {
                    const cur = editor.getCurrentToolId();
                    if (cur === 'eraser' && previousToolRef.current && previousToolRef.current !== 'eraser') {
                        // Small delay so the stroke finalises cleanly
                        requestAnimationFrame(() => {
                            editor.setCurrentTool(previousToolRef.current);
                            setCurrentTool(previousToolRef.current);
                        });
                    }
                }
            }
        };

        const onPointerMove = (e) => {
            if (e.pointerType === 'pen') {
                revealFab();
            }
        };

        // ────────────────────────────────────────────
        // 2.  Palm rejection
        // ────────────────────────────────────────────
        // While the pen is in contact, prevent touch events from creating
        // new strokes.  This is critical on iPads where your palm rests on
        // the screen while drawing.
        const onTouchStart = (e) => {
            if (penInContactRef.current) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // ────────────────────────────────────────────
        // 3.  Track tool changes from the toolbar
        // ────────────────────────────────────────────
        // Keep our state in sync when the user picks a tool via the tldraw UI
        const unsubToolChange = editor.store.listen(
            () => {
                try {
                    const tool = editor.getCurrentToolId();
                    if (tool) setCurrentTool(tool);
                } catch { /* editor may be mid-transition */ }
            },
            { source: 'user', scope: 'session' }
        );

        // ── Attach listeners ──
        // Use capture phase so we see events before tldraw does
        container.addEventListener('pointerdown', onPointerDown, true);
        container.addEventListener('pointerup', onPointerUp, true);
        container.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
        container.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });

        return () => {
            container.removeEventListener('pointerdown', onPointerDown, true);
            container.removeEventListener('pointerup', onPointerUp, true);
            container.removeEventListener('pointermove', onPointerMove, true);
            container.removeEventListener('touchstart', onTouchStart, true);
            unsubToolChange();
            if (fabTimeoutRef.current) clearTimeout(fabTimeoutRef.current);
        };
    }, [editorReady, editorRef, revealFab]);

    // ── Keyboard shortcut: E to toggle eraser ──
    useEffect(() => {
        const onKeyDown = (e) => {
            // Don't fire when typing in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            if (e.key === 'e' || e.key === 'E') {
                // Only handle if not a modifier combo (Ctrl+E, etc.)
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                toggleEraser();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [toggleEraser]);

    // ────────────────────────────────────────────
    // 4.  Floating quick-toggle button
    // ────────────────────────────────────────────
    const isEraser = currentTool === 'eraser';

    return (
        <button
            className={`pencil-fab ${showFab ? 'pencil-fab--visible' : ''}`}
            onClick={toggleEraser}
            title={isEraser ? 'Switch to Draw (E)' : 'Switch to Eraser (E)'}
            aria-label={isEraser ? 'Switch to Draw tool' : 'Switch to Eraser tool'}
        >
            {isEraser ? (
                /* Pen / Draw icon */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                    <circle cx="11" cy="11" r="2" />
                </svg>
            ) : (
                /* Eraser icon */
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 21h10" />
                    <path d="M5.5 13.5 9 17l7.5-7.5L13 6l-7.5 7.5z" />
                    <path d="m2 21 3.5-3.5" />
                    <path d="M19 3l2 2-9.5 9.5-2-2L19 3z" />
                </svg>
            )}
        </button>
    );
}
