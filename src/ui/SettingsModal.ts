import type { AudioCue } from '../contracts/index.ts';
import type { SaveStore } from '../core/index.ts';
import { el } from '../app/dom.ts';

export interface SettingsModalDeps {
  saveStore: SaveStore;
  onSettingsChanged: () => void;
  onSaveChanged: () => void;
  onClose: () => void;
  onCue: (cue: AudioCue) => void;
}

export function renderSettingsModal(deps: SettingsModalDeps): HTMLElement {
  const { saveStore, onCue } = deps;
  let statusMessage: { ok: boolean; text: string } | null = null;
  let confirmResetArmed = false;
  let draftJsonText = saveStore.exportJson();

  const backdrop = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-settings' },
  });

  const renderContent = (): void => {
    backdrop.replaceChildren();
    const state = saveStore.getState();
    const s = state.settings;

    const bgmInput = el('input', {
      className: 'gothic-range',
      attrs: { type: 'range', min: 0, max: 100, value: Math.round(s.bgmVolume * 100) },
      dataset: { testid: 'slider-bgm' },
    }) as HTMLInputElement;
    const bgmLabel = el('span', { className: 'num-font', text: `${Math.round(s.bgmVolume * 100)}%` });
    bgmInput.addEventListener('input', () => {
      const val = Number(bgmInput.value) / 100;
      bgmLabel.textContent = `${bgmInput.value}%`;
      saveStore.updateSettings({ bgmVolume: val });
      deps.onSettingsChanged();
    });

    const sfxInput = el('input', {
      className: 'gothic-range',
      attrs: { type: 'range', min: 0, max: 100, value: Math.round(s.sfxVolume * 100) },
      dataset: { testid: 'slider-sfx' },
    }) as HTMLInputElement;
    const sfxLabel = el('span', { className: 'num-font', text: `${Math.round(s.sfxVolume * 100)}%` });
    sfxInput.addEventListener('input', () => {
      const val = Number(sfxInput.value) / 100;
      sfxLabel.textContent = `${sfxInput.value}%`;
      saveStore.updateSettings({ sfxVolume: val });
      deps.onSettingsChanged();
    });

    const jsonArea = el('textarea', {
      className: 'save-textarea',
      dataset: { testid: 'textarea-save-json' },
    }) as HTMLTextAreaElement;
    jsonArea.value = draftJsonText;
    jsonArea.addEventListener('input', () => {
      draftJsonText = jsonArea.value;
    });

    const fileInput = el('input', {
      attrs: { type: 'file', accept: 'application/json,.json', style: 'display:none' },
    }) as HTMLInputElement;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      draftJsonText = text;
      const res = saveStore.importJson(text);
      if (res.ok) {
        draftJsonText = saveStore.exportJson();
        statusMessage = { ok: true, text: '已从文件导入存档并同步配置。' };
        onCue({ type: 'ui_buy' });
        deps.onSettingsChanged();
        deps.onSaveChanged();
      } else {
        statusMessage = { ok: false, text: `导入失败：${res.error}` };
        onCue({ type: 'ui_error' });
      }
      renderContent();
    });

    const audioCard = el('section', {
      className: 'settings-card',
      children: [
        el('h3', { text: '音频与画面表现' }),
        el('div', {
          className: 'slider-row',
          children: [
            el('div', { className: 'slider-label-row', children: ['背景音乐 (BGM)', bgmLabel] }),
            bgmInput,
          ],
        }),
        el('div', {
          className: 'slider-row',
          children: [
            el('div', { className: 'slider-label-row', children: ['战斗音效 (SFX)', sfxLabel] }),
            sfxInput,
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '全局静音',
            el('button', {
              className: `gothic-btn ${s.muted ? 'gothic-btn-danger' : ''}`,
              text: s.muted ? '已静音' : '开启中',
              dataset: { testid: 'btn-settings-mute' },
              onClick: () => {
                saveStore.updateSettings({ muted: !s.muted });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '浮动伤害数字',
            el('button', {
              className: `gothic-btn ${s.showDamageNumbers ? 'gothic-btn-gold' : ''}`,
              text: s.showDamageNumbers ? '显示' : '隐藏',
              onClick: () => {
                onCue({ type: 'ui_click' });
                saveStore.updateSettings({ showDamageNumbers: !s.showDamageNumbers });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '屏幕震动反馈',
            el('button', {
              className: `gothic-btn ${s.screenShake ? 'gothic-btn-gold' : ''}`,
              text: s.screenShake ? '开启' : '关闭',
              onClick: () => {
                onCue({ type: 'ui_click' });
                saveStore.updateSettings({ screenShake: !s.screenShake });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '特效画质档位',
            el('button', {
              className: 'gothic-btn',
              text: s.visualEffectsQuality === 'high' ? '高清 (High)' : '流畅 (Medium)',
              onClick: () => {
                onCue({ type: 'ui_click' });
                saveStore.updateSettings({
                  visualEffectsQuality: s.visualEffectsQuality === 'high' ? 'medium' : 'high',
                });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '战场实时小雷达',
            el('button', {
              className: `gothic-btn ${s.showMinimap ? 'gothic-btn-gold' : ''}`,
              text: s.showMinimap ? '开启' : '关闭',
              dataset: { testid: 'btn-settings-minimap' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                saveStore.updateSettings({ showMinimap: !s.showMinimap });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
        el('div', {
          className: 'switch-row',
          children: [
            '单手鼠标跟随移动 [F]',
            el('button', {
              className: `gothic-btn ${s.mouseFollow ? 'gothic-btn-gold' : ''}`,
              text: s.mouseFollow ? '开启' : '关闭',
              dataset: { testid: 'btn-settings-mouse-follow' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                saveStore.updateSettings({ mouseFollow: !s.mouseFollow });
                deps.onSettingsChanged();
                renderContent();
              },
            }),
          ],
        }),
      ],
    });

    const saveCard = el('section', {
      className: 'settings-card',
      children: [
        el('h3', { text: 'JSON 存档导入 / 导出 / 重置' }),
        jsonArea,
        fileInput,
        el('div', {
          className: 'title-meta-pills',
          children: [
            el('button', {
              className: 'gothic-btn',
              text: '复制并导出 JSON',
              dataset: { testid: 'btn-export-save' },
              onClick: async () => {
                const json = saveStore.exportJson();
                draftJsonText = json;
                jsonArea.value = json;
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(json);
                  }
                } catch {
                  // Ignore clipboard denial in restricted browser contexts
                }
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ashen-survivors-save.json';
                a.click();
                URL.revokeObjectURL(url);
                statusMessage = { ok: true, text: '已生成存档 JSON 并触发下载/复制。' };
                onCue({ type: 'ui_click' });
                renderContent();
              },
            }),
            el('button', {
              className: 'gothic-btn gothic-btn-gold',
              text: '应用文本框 JSON 导入',
              dataset: { testid: 'btn-import-save' },
              onClick: () => {
                draftJsonText = jsonArea.value;
                const res = saveStore.importJson(jsonArea.value);
                if (res.ok) {
                  draftJsonText = saveStore.exportJson();
                  statusMessage = { ok: true, text: 'JSON 存档校验通过并已成功载入！' };
                  onCue({ type: 'ui_buy' });
                  deps.onSettingsChanged();
                  deps.onSaveChanged();
                } else {
                  statusMessage = { ok: false, text: `存档无效：${res.error}` };
                  onCue({ type: 'ui_error' });
                }
                renderContent();
              },
            }),
            el('button', {
              className: 'gothic-btn',
              text: '选择文件导入',
              onClick: () => {
                onCue({ type: 'ui_click' });
                fileInput.click();
              },
            }),
          ],
        }),
        el('div', {
          className: 'title-meta-pills',
          children: confirmResetArmed
            ? [
                el('button', {
                  className: 'gothic-btn gothic-btn-danger',
                  text: '确认彻底清空全部存档',
                  dataset: { testid: 'btn-confirm-reset-save' },
                  onClick: () => {
                    saveStore.reset();
                    draftJsonText = saveStore.exportJson();
                    confirmResetArmed = false;
                    statusMessage = { ok: true, text: '存档已重置为初始状态。' };
                    onCue({ type: 'ui_click' });
                    deps.onSettingsChanged();
                    deps.onSaveChanged();
                    renderContent();
                  },
                }),
                el('button', {
                  className: 'gothic-btn',
                  text: '取消重置',
                  onClick: () => {
                    confirmResetArmed = false;
                    renderContent();
                  },
                }),
              ]
            : [
                el('button', {
                  className: 'gothic-btn gothic-btn-danger',
                  text: '重置全部存档',
                  dataset: { testid: 'btn-reset-save' },
                  onClick: () => {
                    onCue({ type: 'ui_click' });
                    confirmResetArmed = true;
                    renderContent();
                  },
                }),
              ],
        }),
        statusMessage
          ? el('div', {
              className: `status-banner ${statusMessage.ok ? 'ok' : 'err'}`,
              dataset: { testid: 'settings-status-banner' },
              text: statusMessage.text,
            })
          : null,
      ],
    });

    backdrop.appendChild(
      el('div', {
        className: 'modal-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', { className: 'modal-title', text: '系统设置与存档管理' }),
                  el('p', { className: 'modal-subtitle', text: 'AUDIO · VISUAL · SAVE TRANSFER' }),
                ],
              }),
              el('button', {
                className: 'gothic-btn',
                text: '关闭',
                dataset: { testid: 'btn-close-settings' },
                onClick: () => {
                  onCue({ type: 'ui_click' });
                  deps.onClose();
                },
              }),
            ],
          }),
          el('div', {
            className: 'modal-body',
            children: [
              el('div', {
                className: 'settings-sections',
                children: [audioCard, saveCard],
              }),
            ],
          }),
        ],
      }),
    );
  };

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      onCue({ type: 'ui_click' });
      deps.onClose();
    }
  });

  renderContent();
  return backdrop;
}
