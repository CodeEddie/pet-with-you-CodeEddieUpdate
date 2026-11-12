const assert = require('node:assert/strict');

module.exports = async function verifyChatSizing(win) {
  const result = await win.webContents.executeJavaScript(`(() => {
    const pet = sprites[0];
    const originalSize = pet.size;
    const originalReplyMode = window.petPreferences.replyMode;
    const sizes = [180, 300, 462, 650, 900];
    const font = element => parseFloat(getComputedStyle(element).fontSize);
    pet.stopMove();
    pet.stopThrow();
    pet.closeMenu();
    window.petPreferences.replyMode = 'next';
    try {
      pet.showWhisper('测试回复');
      pet.showChatFromMenu();
      const chat = document.querySelector('.dsh-pet-chat');
      const input = chat.querySelector('textarea');
      const reply = pet.bubble.querySelector('.reply-content');
      input.value = '正在输入的文字';
      input.dispatchEvent(new Event('input'));
      input.setSelectionRange(1, 3);
      const chatSizes = sizes.map(size => {
        pet.resizePet(size);
        return {
          input: font(input),
          progress: font(chat.querySelector('.dsh-pet-chat-progress')),
          error: font(chat.querySelector('.dsh-pet-chat-err')),
          reply: font(reply),
          intact: chat.isConnected && reply.isConnected && input.value === '正在输入的文字' &&
            input.selectionStart === 1 && input.selectionEnd === 3 && reply.textContent === '测试回复',
        };
      });
      pet.chatClose();
      pet.showChatFromMenu(true);
      const draft = document.querySelector('.dsh-pet-chat');
      const draftSizes = [900, 462, 180].map(size => {
        pet.resizePet(size);
        return {
          input: font(draft.querySelector('textarea')),
          progress: font(draft.querySelector('.dsh-pet-chat-progress')),
          button: font(draft.querySelector('button')),
          basis: font(draft.querySelector('[role=status]')),
        };
      });
      return { chatSizes, draftSizes };
    } finally {
      pet.chatClose?.();
      pet.closeReply();
      pet.resizePet(originalSize);
      window.petPreferences.replyMode = originalReplyMode;
    }
  })()`);

  for (const field of ['input', 'progress', 'error', 'reply']) {
    const fonts = result.chatSizes.map(entry => entry[field]);
    assert.ok(fonts.every((value, index) => !index || value > fonts[index - 1]),
      field + ' should grow across the full size range: ' + fonts.join(', '));
  }
  assert.ok(result.chatSizes.every(entry => entry.intact), 'resize keeps the input, selection and reply in place');
  for (const field of ['input', 'progress', 'button', 'basis']) {
    const fonts = result.draftSizes.map(entry => entry[field]);
    assert.ok(fonts[0] > fonts[1] && fonts[1] > fonts[2], 'draft ' + field + ' shrinks with the pet: ' + fonts.join(', '));
  }
  return result;
};
