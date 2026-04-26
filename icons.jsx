/* Inline SVG icons — original geometric set, not mimicking any brand */

const Icon = ({ name, size = 16, stroke = 1.5 }) => {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (name) {
    case 'text-channel': return (
      <svg {...common}><circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/></svg>
    );
    case 'voice-channel': return (
      <svg {...common}><path d="M6 9v6M10 6v12M14 8v8M18 10v4"/></svg>
    );
    case 'announce': return (
      <svg {...common}><path d="M4 14V10L15 6V18L4 14Z"/><path d="M7 14V15.5A2 2 0 0 0 11 15.5V14"/></svg>
    );
    case 'hash': return (
      <svg {...common} strokeWidth="1.6"><path d="M6 10h13M5 15h13M10 4l-3 16M17 4l-3 16"/></svg>
    );
    case 'at': return (
      <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/></svg>
    );
    case 'search': return (
      <svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>
    );
    case 'bell': return (
      <svg {...common}><path d="M6 18h12M18 18V11a6 6 0 1 0-12 0v7M10 21h4"/></svg>
    );
    case 'pin': return (
      <svg {...common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/></svg>
    );
    case 'inbox': return (
      <svg {...common}><path d="M4 14V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M4 14h4l1 2h6l1-2h4"/></svg>
    );
    case 'help': return (
      <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17v.01"/></svg>
    );
    case 'mic': return (
      <svg {...common}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
    );
    case 'mic-off': return (
      <svg {...common}><path d="M3 3l18 18M9 6a3 3 0 0 1 6 0v4m0 3a3 3 0 0 1-6 0M5 11a7 7 0 0 0 11.5 5.4M19 11v0M12 21v-3"/></svg>
    );
    case 'headphones': return (
      <svg {...common}><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>
    );
    case 'headphones-off': return (
      <svg {...common}><path d="M3 3l18 18M4 15v-3a8 8 0 0 1 12.5-6.6M20 13v2"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>
    );
    case 'settings': return (
      <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
    );
    case 'plus': return (
      <svg {...common}><path d="M12 5v14M5 12h14"/></svg>
    );
    case 'plus-circle': return (
      <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
    );
    case 'close': return (
      <svg {...common}><path d="M6 6l12 12M18 6L6 18"/></svg>
    );
    case 'chevron-down': return (
      <svg {...common}><path d="M6 9l6 6 6-6"/></svg>
    );
    case 'chevron-right': return (
      <svg {...common}><path d="M9 6l6 6-6 6"/></svg>
    );
    case 'smile': return (
      <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="0.5"/><circle cx="15" cy="10" r="0.5"/><path d="M9 15a4 4 0 0 0 6 0"/></svg>
    );
    case 'gif': return (
      <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9 10a2 2 0 1 0 0 4h1v-2M13 10v4M17 10h-3v4M14 12h2"/></svg>
    );
    case 'paperclip': return (
      <svg {...common}><path d="M7 12l7-7a4 4 0 0 1 5.7 5.7l-10 10a2.5 2.5 0 0 1-3.5-3.5l8.5-8.5"/></svg>
    );
    case 'camera': return (
      <svg {...common}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>
    );
    case 'telegram': return (
      <svg {...common}><path d="M21.8 3.1L2.3 10.7c-1.3.5-1.3 1.3-.2 1.6l4.9 1.5 1.9 5.8c.2.7.5.9 1 .9.4 0 .6-.2 1-.5l2.5-2.4 4.9 3.6c.9.5 1.5.2 1.8-.8L22.8 4c.4-1.3-.5-1.9-1-0.9z"/></svg>
    );
    case 'send': return (
      <svg {...common}><path d="M4 12l16-8-5 16-3-7-8-1Z"/></svg>
    );
    case 'reply': return (
      <svg {...common}><path d="M10 6L4 12l6 6M4 12h10a6 6 0 0 1 6 6v2"/></svg>
    );
    case 'more': return (
      <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
    );
    case 'more-vertical': return (
      <svg {...common}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    );
    case 'message-circle': return (
      <svg {...common}><path d="M21 11.5a8.5 8.5 0 0 1-12.8 7.3L4 20l1.2-4.1A8.5 8.5 0 1 1 21 11.5Z"/></svg>
    );
    case 'thread': return (
      <svg {...common}><path d="M4 6h16M4 11h10M4 16h6M14 14l-4 4 4 4"/></svg>
    );
    case 'compass': return (
      <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5L13 13l-4.5 2.5 2.5-4.5L15.5 8.5Z"/></svg>
    );
    case 'users': return (
      <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 19a6 6 0 0 1 12 0M16 11a3 3 0 0 0 0-6M21 19a5 5 0 0 0-4-4.9"/></svg>
    );
    case 'book': return (
      <svg {...common}><path d="M5 4a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h14v-4H5M19 4H9a1 1 0 0 0-1 1v12h12V5a1 1 0 0 0-1-1Z"/></svg>
    );
    case 'feather': return (
      <svg {...common}><path d="M6 18L18 6a4 4 0 0 0-5.7 0L8 10a4 4 0 0 0 0 5.7M6 18h7a4 4 0 0 0 4-4V9M6 18l-2 2"/></svg>
    );
    case 'sparkle': return (
      <svg {...common}><path d="M12 4l1.5 5L18 10l-4.5 1L12 16l-1.5-5L6 10l4.5-1L12 4ZM19 4v3M21 5.5h-2"/></svg>
    );
    default: return <svg {...common}/>;
  }
};

window.Icon = Icon;
