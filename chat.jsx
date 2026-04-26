/* Chat area: header, messages, composer */

const { useState: useStateChat, useEffect: useEffectChat, useRef: useRefChat, useMemo: useMemoChat } = React;

const QUICK_REACTIONS = [
  { emo: '📚', label: '添加读书表情' },
  { emo: '☕', label: '添加咖啡表情' },
  { emo: '🌿', label: '添加植物表情' },
  { emo: '✨', label: '添加闪光表情' },
];

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMessageHtml(content) {
  const escaped = escapeHtml(content);
  const withMentions = escaped.replace(/(^|\s)(@[\p{L}\p{N}_路.-]+)/gu, '$1<span class="mention">$2</span>');
  return withMentions.replace(/\n/g, '<br/>');
}

function getImageLinks(content) {
  const matches = String(content || '').match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)|\/uploads\/\S+\.(?:jpg|jpeg|png|gif|webp)/gi);
  return matches || [];
}

function getInviteLink(content) {
  const match = String(content || '').match(/https?:\/\/\S*(?:invite=|\/invite\/)\S*|hearth:\/\/invite\/\S+|invite:[^\s]+/i);
  return match ? match[0].replace(/[，。！？、,.!?]+$/, '') : '';
}

function ChatHeader({ channel, onToggleMembers, searchValue, setSearchValue, pinsOpen, onTogglePins }) {
  if (!channel) return null;
  return (
    <div className="chat-header">
      <div className="title">
        <span className="glyph"><ChannelGlyph kind={channel.kind}/></span>
        {channel.name}
      </div>
      {channel.topic && <div className="topic">{channel.topic}</div>}
      <div className="actions">
        <button className={`icon-btn ${pinsOpen ? 'active' : ''}`} title="置顶消息" onClick={onTogglePins}><Icon name="pin" size={17}/></button>
        <button className="icon-btn" title="成员列表" onClick={onToggleMembers}><Icon name="users" size={17}/></button>
        <div className="search-box">
          <Icon name="search" size={12}/>
          <input placeholder="搜索" value={searchValue} onChange={e => setSearchValue(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function ContextMenu({ x, y, canEdit, canDelete, canPin, onReact, onEdit, onDelete, onPin, onThread, onClose }) {
  useEffectChat(function closeOnEscape() {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={onClose}/>
      <div className="context-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 310 }}>
        <button onClick={() => { onReact('📚'); onClose(); }}>表情 📚</button>
        <button onClick={() => { onThread(); onClose(); }}>线索回复</button>
        {canPin && <button onClick={() => { onPin(); onClose(); }}>置顶</button>}
        {canEdit && <button onClick={() => { onEdit(); onClose(); }}>编辑</button>}
        {canDelete && <button className="danger" onClick={() => { onDelete(); onClose(); }}>删除</button>}
      </div>
    </>
  );
}

function MessageGroup({ msg, onOpenProfile, onReact, onEdit, onDelete, onPin, onOpenThread, currentUser, currentRole, inviteDecision, onAcceptInvite, onRejectInvite }) {
  const [editing, setEditing] = useStateChat(false);
  const [editValue, setEditValue] = useStateChat(msg.content || msg.lines?.join('\n') || '');
  const [menu, setMenu] = useStateChat(null);
  const canEdit = msg.authorId === currentUser?.id && !msg.isDeleted;
  const canDelete = !msg.isDeleted && (msg.authorId === currentUser?.id || ['founder', 'mod'].includes(currentRole));
  const canPin = !msg.isDeleted && ['founder', 'mod'].includes(currentRole);
  const content = msg.content || msg.lines?.join('\n') || '';
  const html = useMemoChat(() => renderMessageHtml(content), [content]);
  const imageLinks = useMemoChat(() => getImageLinks(content), [content]);
  const inviteLink = useMemoChat(() => getInviteLink(content), [content]);

  useEffectChat(function syncEditValue() {
    setEditValue(msg.content || msg.lines?.join('\n') || '');
  }, [msg.id, msg.content]);

  const submitEdit = () => {
    const next = editValue.trim();
    if (!next) return;
    onEdit(msg.id, next);
    setEditing(false);
  };

  const onEditKey = (e) => {
    if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(content);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
  };

  return (
    <div
      className={`msg-group ${msg.isDeleted ? 'deleted' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      {msg.replyTo && (
        <div className="reply-context" style={{ position: 'absolute', top: 2, left: 72 }}>
          <Icon name="reply" size={12}/>
          <span className="reply-author">{msg.replyTo.name}</span>
          <span style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
            {msg.replyTo.text}
          </span>
        </div>
      )}
      <div className="msg-avatar" style={{ marginTop: msg.replyTo ? 18 : 0 }}>
        <Avatar color={msg.color} label={msg.name?.[0] || '?'} size={36} onClick={e => onOpenProfile(msg, e)} kind={msg.bot ? 'bot' : undefined}/>
      </div>
      <div className="msg-body" style={{ marginTop: msg.replyTo ? 18 : 0 }}>
        <div className="msg-head">
          <span className={`author ${msg.role ? 'role-'+msg.role : ''}`} onClick={e => onOpenProfile(msg, e)}>
            {msg.name}
          </span>
          {msg.bot && <span className="badge-bot">BOT</span>}
          <span className="time">{msg.time}{msg.isEdited ? ' · 已编辑' : ''}</span>
        </div>
        {editing ? (
          <textarea
            className="form-input"
            style={{ minHeight: 74, padding: 10, resize: 'vertical' }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={onEditKey}
            autoFocus
          />
        ) : (
          <>
            <div className="msg-content" dangerouslySetInnerHTML={{ __html: html }} />
            {imageLinks.length > 0 && (
              <div className="image-previews">
                {imageLinks.map(link => (
                  <a key={link} href={link} target="_blank" rel="noreferrer">
                    <img src={link} alt="图片预览" />
                  </a>
                ))}
              </div>
            )}
            {inviteLink && (onAcceptInvite || onRejectInvite) && (
              <div className="dm-invite-card">
                <div>
                  <div className="dm-invite-title">服务器邀请</div>
                  <div className="dm-invite-sub">接受后会加入服务器；如需审核，会进入申请列表。</div>
                </div>
                <div className="dm-invite-actions">
                  {inviteDecision === 'accepted' ? (
                    <span className="dm-invite-status">已接受</span>
                  ) : inviteDecision === 'pending' ? (
                    <span className="dm-invite-status">待管理员审核</span>
                  ) : inviteDecision === 'rejected' ? (
                    <span className="dm-invite-status">已拒绝</span>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={() => onRejectInvite?.(msg)}>拒绝</button>
                      <button className="btn btn-primary" onClick={() => onAcceptInvite?.(msg)}>接受邀请</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {(msg.reactions || []).length > 0 && (
          <div className="reactions">
            {(msg.reactions || []).map(r => (
              <span key={r.emo} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => onReact(msg.id, r.emo)}>
                <span className="emo">{r.emo}</span>
                <span>{r.count}</span>
              </span>
            ))}
            <span className="reaction" onClick={() => onReact(msg.id, '📚')} style={{ opacity: 0.7 }}>
              <Icon name="smile" size={12}/>
            </span>
          </div>
        )}
      </div>
      <div className="msg-actions">
        {QUICK_REACTIONS.map(item => (
          <button key={item.emo} title={item.label} aria-label={item.label} onClick={() => onReact(msg.id, item.emo)}>
            {item.emo}
          </button>
        ))}
        <button title="线索回复" aria-label="线索回复" onClick={() => onOpenThread(msg)}><Icon name="thread" size={15}/></button>
        {canPin && <button title="置顶消息" aria-label="置顶消息" onClick={() => onPin(msg.id)}><Icon name="pin" size={15}/></button>}
        {canEdit && <button title="编辑消息" aria-label="编辑消息" onClick={() => setEditing(true)}><Icon name="thread" size={15}/></button>}
        {canDelete && <button title="删除消息" aria-label="删除消息" onClick={() => onDelete(msg.id)}><Icon name="close" size={15}/></button>}
        <button title="更多操作" aria-label="更多操作" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}><Icon name="more" size={15}/></button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          canEdit={canEdit}
          canDelete={canDelete}
          canPin={canPin}
          onReact={(emo) => onReact(msg.id, emo)}
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(msg.id)}
          onPin={() => onPin(msg.id)}
          onThread={() => onOpenThread(msg)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const EMOJI_CATEGORIES = [
  { label: '表情', icon: '😀', emojis: ['😀','😂','🤣','😊','😍','🤔','😎','🥳','😢','😡','🥺','😴','🤗','😏','😜','😋','🤩','😤','😱','😈'] },
  { label: '手势', icon: '👍', emojis: ['👍','👎','👏','🙌','💪','👋','🤝','✌️','🤞','👌','🤌','👆','👇','👈','👉','🖐️','✊','🤘','🙏','🫶'] },
  { label: '心形', icon: '❤️', emojis: ['❤️','💔','💕','💖','💗','💘','💝','💞','💓','🩷','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💟','❣️'] },
  { label: '自然', icon: '🌿', emojis: ['🌿','☕','🫖','🌱','🌸','🍃','🌍','🔥','✨','🌟','💡','🌈','⭐','🌙','☀️','🌧️','❄️','🍀','🌺','🌻'] },
  { label: '物品', icon: '📚', emojis: ['📚','📖','📝','📌','✂️','🔗','📎','🖊️','📅','⏰','🔔','🎵','🎬','🎨','🎮','🏆','📷','🔑','💎','📦'] },
  { label: '符号', icon: '🕯', emojis: ['🕯','💭','👀','🎉','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','💯','❗','❓','💬','🗨️','💤','♻️'] },
];

function Composer({ channelName, onSend, error, typingText, members = [], sendMode = 'enter' }) {
  const [val, setVal] = useStateChat('');
  const [uploading, setUploading] = useStateChat(false);
  const [uploadError, setUploadError] = useStateChat('');
  const [mentionOpen, setMentionOpen] = useStateChat(false);
  const [mentionIndex, setMentionIndex] = useStateChat(0);
  const [emojiOpen, setEmojiOpen] = useStateChat(false);
  const [emojiCategory, setEmojiCategory] = useStateChat(0);
  const ref = useRefChat(null);
  const fileRef = useRefChat(null);
  const stopTypingRef = useRefChat(null);
  const mentionOptions = members.slice(0, 8);

  const resizeComposer = (ta = ref.current) => {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
  };

  const submit = async () => {
    const v = val.trim();
    if (!v) return;
    await onSend(v);
    API.sendTyping(false);
    setVal('');
    setMentionOpen(false);
    if (ref.current) ref.current.style.height = 'auto';
  };

  const uploadImageFile = async (file) => {
    if (!file?.type?.startsWith('image/')) {
      throw new Error('只能上传图片');
    }
    const result = await API.upload(file);
    return result.url;
  };

  const uploadImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('只能上传图片');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const url = await uploadImageFile(file);
      await onSend(url);
    } catch (err) {
      setUploadError(err.message || '图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const insertIntoComposer = (text) => {
    const ta = ref.current;
    setVal(prev => {
      if (!ta) return prev ? `${prev}\n${text}` : text;
      const start = ta.selectionStart ?? prev.length;
      const end = ta.selectionEnd ?? start;
      const before = prev.slice(0, start);
      const after = prev.slice(end);
      const prefix = before && !before.endsWith('\n') ? '\n' : '';
      const suffix = after && !text.endsWith('\n') ? '\n' : '';
      const next = `${before}${prefix}${text}${suffix}${after}`;
      const caret = before.length + prefix.length + text.length;
      window.setTimeout(() => {
        ta.focus();
        ta.selectionStart = caret;
        ta.selectionEnd = caret;
        resizeComposer(ta);
      }, 0);
      return next;
    });
    setMentionOpen(false);
  };

  const onPaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const files = items
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;

    e.preventDefault();
    setUploading(true);
    setUploadError('');
    try {
      const urls = [];
      for (const file of files) {
        urls.push(await uploadImageFile(file));
      }
      insertIntoComposer(urls.join('\n'));
    } catch (err) {
      setUploadError(err.message || '图片粘贴上传失败');
    } finally {
      setUploading(false);
    }
  };

  const insertMention = () => {
    const member = mentionOptions[mentionIndex];
    if (!member) return;
    setVal(prev => prev.replace(/@[\p{L}\p{N}_路.-]*$/u, '@' + member.name + ' '));
    setMentionOpen(false);
  };

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      fileRef.current?.click();
      return;
    }
    if (mentionOpen && e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex(i => Math.min(i + 1, mentionOptions.length - 1));
      return;
    }
    if (mentionOpen && e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (mentionOpen && e.key === 'Enter') {
      e.preventDefault();
      insertMention();
      return;
    }
    const modifier = e.ctrlKey || e.metaKey;
    const shouldSend = sendMode === 'ctrl-enter'
      ? e.key === 'Enter' && modifier
      : e.key === 'Enter' && !e.shiftKey;
    if (shouldSend) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (e) => {
    const next = e.target.value;
    setVal(next);
    setMentionOpen(/@[\p{L}\p{N}_路.-]*$/u.test(next) && mentionOptions.length > 0);
    setMentionIndex(0);
    API.sendTyping(true);
    if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
    stopTypingRef.current = window.setTimeout(() => API.sendTyping(false), 2000);
    resizeComposer(e.target);
  };

  useEffectChat(function bindPasteImages() {
    const ta = ref.current;
    if (!ta) return undefined;
    const handlePaste = event => onPaste(event);
    ta.addEventListener('paste', handlePaste);
    return function unbindPasteImages() {
      ta.removeEventListener('paste', handlePaste);
    };
  }, [onPaste]);

  useEffectChat(function cleanupTypingTimer() {
    return function cleanup() {
      if (stopTypingRef.current) window.clearTimeout(stopTypingRef.current);
      API.sendTyping(false);
    };
  }, []);

  return (
    <div className="composer-wrap" style={{ position: 'relative' }}>
      {mentionOpen && (
        <div className="mention-popover">
          {mentionOptions.map((member, index) => (
            <div key={member.id || member.name} className={index === mentionIndex ? 'active' : ''} onMouseDown={e => {
              e.preventDefault();
              setMentionIndex(index);
              setTimeout(insertMention, 0);
            }}>
              <span className={`avatar ${member.color || 'av-1'}`}/>
              <span>{member.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="composer">
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadImage}/>
        <button className="plus" title="上传图片" onClick={() => fileRef.current?.click()} disabled={uploading}><Icon name="plus-circle" size={20} /></button>
        <textarea ref={ref} rows={1} placeholder={`发送到 #${channelName}`} value={val} onChange={onChange} onKeyDown={onKey}/>
        <div className="right-tools" style={{ position: 'relative' }}>
          {emojiOpen && (
            <div style={{
              position: 'absolute',
              right: -8,
              bottom: '100%',
              marginBottom: 4,
              width: 296,
              background: 'var(--paper-0)',
              border: '1px solid var(--paper-3)',
              borderRadius: 10,
              boxShadow: '0 16px 40px rgba(42, 31, 20, 0.2)',
              zIndex: 80,
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--paper-3)',
                padding: '4px 6px',
                gap: 2,
              }}>
                {EMOJI_CATEGORIES.map((cat, i) => (
                  <button
                    key={cat.label}
                    onClick={() => setEmojiCategory(i)}
                    style={{
                      background: i === emojiCategory ? 'var(--paper-2)' : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 18,
                      padding: '4px 8px',
                      lineHeight: 1,
                      transition: 'background 0.15s',
                    }}
                    title={cat.label}
                  >{cat.icon}</button>
                ))}
              </div>
              <div style={{
                maxHeight: 200,
                overflowY: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                padding: 8,
                gap: 2,
                alignContent: 'flex-start',
              }}>
                {EMOJI_CATEGORIES[emojiCategory].emojis.map(emo => (
                  <button
                    key={emo}
                    onMouseDown={e => {
                      e.preventDefault();
                      setVal(prev => prev + emo);
                      setEmojiOpen(false);
                      ref.current?.focus();
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 22,
                      width: 36,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      lineHeight: 1,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    title={emo}
                  >{emo}</button>
                ))}
              </div>
            </div>
          )}
          <button className={`icon-btn ${emojiOpen ? 'active' : ''}`} title="表情" onClick={() => { setEmojiOpen(o => !o); setEmojiCategory(0); }}><Icon name="smile" size={16}/></button>
          <button className={`send-btn ${val.trim() ? 'ready' : ''}`} disabled={!val.trim()} onClick={submit}><Icon name="send" size={14}/></button>
        </div>
      </div>
      <div className="composer-foot">
        <span><span className="typing-dots"><i/><i/><i/></span><em style={{ fontStyle: 'italic', fontFamily: 'var(--ff-serif)' }}>{uploadError || error || (uploading ? '图片上传中...' : typingText) || ''}</em></span>
        <span>{sendMode === 'ctrl-enter' ? 'Ctrl / Cmd + Enter 发送' : 'Shift + Enter 换行'}</span>
      </div>
    </div>
  );
}

function PinsPanel({ pins, onClose, onUnpin }) {
  return (
    <div className="pins-panel">
      <div className="head">
        <strong>置顶消息</strong>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={14}/></button>
      </div>
      {pins.length === 0 ? (
        <div className="empty">暂无置顶消息</div>
      ) : pins.map(pin => (
        <div className="pin-item" key={pin.id}>
          <div className="meta">{pin.message?.author?.display_name || pin.message?.name || 'Unknown'}</div>
          <div>{pin.message?.content}</div>
          <button className="btn btn-secondary" onClick={() => onUnpin(pin.message_id)}>取消置顶</button>
        </div>
      ))}
    </div>
  );
}

function ThreadPanel({ rootMessage, replies, onClose, onSendReply }) {
  const [value, setValue] = useStateChat('');
  if (!rootMessage) return null;
  const rootContent = rootMessage.content || rootMessage.lines?.join('\n') || '';

  const submit = async () => {
    const text = value.trim();
    if (!text) return;
    await onSendReply(text, rootMessage.id);
    setValue('');
  };

  return (
    <aside className="thread-panel">
      <div className="thread-head">
        <div>
          <strong>线索回复</strong>
          <span>{rootMessage.name}</span>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={14}/></button>
      </div>
      <div className="thread-root">
        <div className="meta">{rootMessage.name} · {rootMessage.time}</div>
        <div dangerouslySetInnerHTML={{ __html: renderMessageHtml(rootContent) }} />
      </div>
      <div className="thread-replies">
        {replies.length === 0 ? (
          <div className="empty">还没有回复</div>
        ) : replies.map(reply => {
          const content = reply.content || reply.lines?.join('\n') || '';
          return (
            <div className="thread-reply" key={reply.id}>
              <div className="meta">{reply.name} · {reply.time}</div>
              <div dangerouslySetInnerHTML={{ __html: renderMessageHtml(content) }} />
            </div>
          );
        })}
      </div>
      <div className="thread-compose">
        <textarea value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }} placeholder="回复这条线索"/>
        <button className={`send-btn ${value.trim() ? 'ready' : ''}`} disabled={!value.trim()} onClick={submit}><Icon name="send" size={14}/></button>
      </div>
    </aside>
  );
}

function ChatArea({ channel, messages, onSend, onToggleMembers, onOpenProfile, searchValue, setSearchValue, sendError, typingText, currentUser, currentRole, sendMode }) {
  const scrollRef = useRefChat(null);
  const [pinsOpen, setPinsOpen] = useStateChat(false);
  const [pins, setPins] = useStateChat([]);
  const [threadMessage, setThreadMessage] = useStateChat(null);
  const members = MEMBERS.flatMap(group => group.items).map(member => ({
    id: member.id,
    name: member.name,
    color: member.color,
  }));

  const loadPins = async () => {
    if (!channel?.id || typeof channel.id !== 'number') return;
    const result = await API.get(`/api/channels/${channel.id}/pins`);
    setPins(result);
  };

  useEffectChat(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffectChat(function refreshPinsOnChannel() {
    if (pinsOpen) loadPins();
  }, [channel?.id, pinsOpen]);

  const editMessage = async (id, content) => {
    await API.patch(`/api/messages/${id}`, { content });
  };
  const deleteMessage = async (id) => {
    await API.del(`/api/messages/${id}`);
  };
  const reactMessage = async (id, emoji) => {
    await API.post(`/api/messages/${id}/reactions`, { emoji });
  };
  const pinMessage = async (id) => {
    if (!channel?.id) return;
    await API.post(`/api/channels/${channel.id}/pins/${id}`, {});
    await loadPins();
  };
  const unpinMessage = async (id) => {
    if (!channel?.id) return;
    await API.del(`/api/channels/${channel.id}/pins/${id}`);
    await loadPins();
  };
  const threadReplies = useMemoChat(() => (
    messages.filter(message => message.type === 'message' && message.replyToId === threadMessage?.id)
  ), [messages, threadMessage?.id]);

  return (
    <div className="chat">
      <ChatHeader
        channel={channel}
        onToggleMembers={onToggleMembers}
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        pinsOpen={pinsOpen}
        onTogglePins={() => setPinsOpen(open => !open)}
      />
      {pinsOpen && <PinsPanel pins={pins} onClose={() => setPinsOpen(false)} onUnpin={unpinMessage}/>}
      <div className="messages" ref={scrollRef}>
        {messages.map(m => {
          if (m.type === 'intro') return <IntroBlock key={m.id} title={m.title} body={m.body} />;
          if (m.type === 'day') return <div key={m.id} className="day-divider"><span>{m.label}</span></div>;
          return (
            <MessageGroup
              key={m.id}
              msg={m}
              onOpenProfile={onOpenProfile}
              onReact={reactMessage}
              onEdit={editMessage}
              onDelete={deleteMessage}
              onPin={pinMessage}
              onOpenThread={setThreadMessage}
              currentUser={currentUser}
              currentRole={currentRole}
            />
          );
        })}
      </div>
      {threadMessage && (
        <ThreadPanel
          rootMessage={threadMessage}
          replies={threadReplies}
          onClose={() => setThreadMessage(null)}
          onSendReply={(text, rootId) => onSend(text, { reply_to_id: rootId })}
        />
      )}
      <Composer channelName={channel?.name || ''} onSend={onSend} error={sendError} typingText={typingText} members={members} sendMode={sendMode}/>
    </div>
  );
}

function IntroBlock({ title, body }) {
  return (
    <div className="channel-intro">
      <div className="badge"><Icon name="hash" size={24}/></div>
      <h2>欢迎来到 #{title}</h2>
      <p>{body}</p>
    </div>
  );
}

Object.assign(window, { ChatArea, ChatHeader, MessageGroup, Composer });
