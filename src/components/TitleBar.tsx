import { useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import { Minus, X, Maximize2, Settings, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Languages } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { useProjectStore } from '@/stores/projectStore';
import closeNormalIcon from '@/assets/macos-traffic-lights/1-close-1-normal.svg';
import closeHoverIcon from '@/assets/macos-traffic-lights/2-close-2-hover.svg';
import minimizeNormalIcon from '@/assets/macos-traffic-lights/2-minimize-1-normal.svg';
import minimizeHoverIcon from '@/assets/macos-traffic-lights/2-minimize-2-hover.svg';
import maximizeNormalIcon from '@/assets/macos-traffic-lights/3-maximize-1-normal.svg';
import maximizeHoverIcon from '@/assets/macos-traffic-lights/3-maximize-2-hover.svg';

interface TitleBarProps {
  onSettingsClick: () => void;
  showBackButton?: boolean;
  onBackClick?: () => void;
}

export function TitleBar({ onSettingsClick, showBackButton, onBackClick }: TitleBarProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const currentProjectName = useProjectStore((state) => state.currentProject?.name);

  console.log('[TitleBar] Initializing...');
  console.log('[TitleBar] isTauri():', isTauri());
  
  const appWindow = isTauri() ? getCurrentWindow() : null;
  
  console.log('[TitleBar] appWindow:', appWindow);
  console.log('[TitleBar] isTauri():', isTauri());
  console.log('[TitleBar] getCurrentWindow():', typeof getCurrentWindow);
  
  const isZh = i18n.language.startsWith('zh');
  const isMac =
    typeof navigator !== 'undefined'
    && /(Mac|iPhone|iPad|iPod)/i.test(`${navigator.platform} ${navigator.userAgent}`);
  const appTitle = t('app.title');
  const titleText = currentProjectName ? `${currentProjectName} - ${appTitle}` : appTitle;

  const handleMinimize = useCallback(async () => {
    console.log('[TitleBar] handleMinimize called, appWindow:', appWindow);
    if (appWindow) {
      try {
        console.log('[TitleBar] Calling minimize()...');
        await appWindow.minimize();
        console.log('[TitleBar] minimize() called successfully');
      } catch (error) {
        console.error('[TitleBar] Error calling minimize():', error);
      }
    } else {
      console.warn('[TitleBar] appWindow is null, not in Tauri environment');
    }
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    console.log('[TitleBar] handleMaximize called, appWindow:', appWindow);
    if (appWindow) {
      try {
        const isMaximized = await appWindow.isMaximized();
        console.log('[TitleBar] Current isMaximized:', isMaximized);
        if (isMaximized) {
          console.log('[TitleBar] Calling unmaximize()...');
          await appWindow.unmaximize();
        } else {
          console.log('[TitleBar] Calling maximize()...');
          await appWindow.maximize();
        }
        console.log('[TitleBar] maximize/unmaximize called successfully');
      } catch (error) {
        console.error('[TitleBar] Error calling maximize/unmaximize():', error);
      }
    } else {
      console.warn('[TitleBar] appWindow is null, not in Tauri environment');
    }
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    console.log('[TitleBar] handleClose called, appWindow:', appWindow);
    if (appWindow) {
      try {
        console.log('[TitleBar] Calling close()...');
        await appWindow.close();
        console.log('[TitleBar] close() called successfully');
      } catch (error) {
        console.error('[TitleBar] Error calling close():', error);
      }
    } else {
      console.warn('[TitleBar] appWindow is null, not in Tauri environment');
    }
  }, [appWindow]);

  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    if (!appWindow) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button') || target?.closest('[data-no-drag="true"]')) {
      return;
    }
    await appWindow.startDragging();
  }, [appWindow]);

  const handleLanguageClick = useCallback(() => {
    const newLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  }, [i18n]);

  const handleThemeClick = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  return (
    <div className="h-10 flex items-center justify-between bg-surface-dark border-b border-border-dark select-none z-50 relative">
      {isMac ? (
        <div className="group flex items-center h-full pl-3 pr-2 gap-2" data-no-drag="true">
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(e) => {
              console.log('[TitleBar] Mac Close button clicked, e:', e);
              e.preventDefault();
              e.stopPropagation();
              handleClose();
            }}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.close')}
            aria-label={t('titleBar.close')}
            style={{ zIndex: 1000, position: 'relative' }}
          >
            <img src={closeNormalIcon} alt="" className="h-3 w-3 pointer-events-none opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={closeHoverIcon} alt="" className="absolute h-3 w-3 pointer-events-none opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(e) => {
              console.log('[TitleBar] Mac Minimize button clicked, e:', e);
              e.preventDefault();
              e.stopPropagation();
              handleMinimize();
            }}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.minimize')}
            aria-label={t('titleBar.minimize')}
            style={{ zIndex: 1000, position: 'relative' }}
          >
            <img src={minimizeNormalIcon} alt="" className="h-3 w-3 pointer-events-none opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={minimizeHoverIcon} alt="" className="absolute h-3 w-3 pointer-events-none opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(e) => {
              console.log('[TitleBar] Mac Maximize button clicked, e:', e);
              e.preventDefault();
              e.stopPropagation();
              handleMaximize();
            }}
            className="relative flex h-3 w-3 items-center justify-center"
            title={t('titleBar.maximize')}
            aria-label={t('titleBar.maximize')}
            style={{ zIndex: 1000, position: 'relative' }}
          >
            <img src={maximizeNormalIcon} alt="" className="h-3 w-3 pointer-events-none opacity-100 transition-opacity group-hover:opacity-0" />
            <img src={maximizeHoverIcon} alt="" className="absolute h-3 w-3 pointer-events-none opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </div>
      ) : null}

      <div
        className="flex-1 h-full flex items-center px-4 cursor-move"
        onMouseDown={handleDragStart}
      >
        {showBackButton && onBackClick && (
          <button
            type="button"
            data-no-drag="true"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onBackClick();
            }}
            className="mr-3 p-1 hover:bg-bg-dark rounded transition-colors"
            title={t('titleBar.back')}
          >
            <ArrowLeft className="w-4 h-4 text-text-muted hover:text-text-dark" />
          </button>
        )}
        <span className="text-sm font-semibold text-text-dark">
          {titleText}
        </span>
        {!isZh && !currentProjectName ? (
          <span className="text-xs text-text-muted ml-2">{t('app.subtitle')}</span>
        ) : null}
      </div>

      {/* 右侧按钮区域 */}
      <div className="flex items-center h-full">
        <button
          type="button"
          onClick={handleLanguageClick}
          className="h-full px-3 hover:bg-bg-dark transition-colors"
          title={i18n.language.startsWith('zh') ? t('titleBar.switchToEnglish') : t('titleBar.switchToChinese')}
        >
          <Languages className="w-4 h-4 text-text-muted" />
        </button>

        <button
          type="button"
          onClick={handleThemeClick}
          className="h-full px-3 hover:bg-bg-dark transition-colors"
          title={theme === 'dark' ? t('theme.light') : t('theme.dark')}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-text-muted" />
          ) : (
            <Moon className="w-4 h-4 text-text-muted" />
          )}
        </button>

        <button
          type="button"
          onClick={onSettingsClick}
          className="h-full px-3 hover:bg-bg-dark transition-colors"
          title={t('settings.title')}
        >
          <Settings className="w-4 h-4 text-text-muted" />
        </button>

        {!isMac ? (
          <>
            <div className="w-px h-4 bg-border-dark mx-1" />

            <button
              type="button"
              onClick={(e) => {
                console.log('[TitleBar] Minimize button clicked, e:', e);
                e.preventDefault();
                e.stopPropagation();
                handleMinimize();
              }}
              className="h-full px-3 hover:bg-bg-dark transition-colors"
              title={t('titleBar.minimize')}
              style={{ zIndex: 1000, position: 'relative' }}
            >
              <Minus className="w-4 h-4 text-text-muted hover:text-text-dark" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('[TitleBar] Maximize button clicked, e:', e);
                e.preventDefault();
                e.stopPropagation();
                handleMaximize();
              }}
              className="h-full px-3 hover:bg-bg-dark transition-colors"
              title={t('titleBar.maximize')}
              style={{ zIndex: 1000, position: 'relative' }}
            >
              <Maximize2 className="w-4 h-4 text-text-muted hover:text-text-dark" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                console.log('[TitleBar] Close button clicked, e:', e);
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }}
              className="h-full px-3 hover:bg-red-500 transition-colors group"
              title={t('titleBar.close')}
              style={{ zIndex: 1000, position: 'relative' }}
            >
              <X className="w-4 h-4 text-text-muted group-hover:text-white" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
