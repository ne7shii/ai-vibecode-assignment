'use client';
import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import s from './public.module.css';

/**
 * Fades its children in when scrolled into view. Content is visible by default (SSR / no JS /
 * reduced motion); only elements that start below the fold are hidden, then revealed.
 */
export default function Reveal({ children, as: Tag = 'div', delay = 0, className = '', ...rest }: {
  children: ReactNode; as?: ElementType; delay?: number; className?: string; [k: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already on screen
    setHidden(true);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setHidden(false); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`${s.rv} ${hidden ? s.rvHidden : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}
