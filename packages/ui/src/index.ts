/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  @kelvyntube/ui — design system Kelvyn Tube
 *  Composants purs (props + callbacks) : aucun appel réseau, aucun store,
 *  aucun import de `next/*`. La navigation passe par la prop `linkComponent`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Utilitaires ────────────────────────────────────────────────────────────
export { cn } from './cn';
export { resolveLinkComponent } from './types';
export type { LinkComponent, LinkLikeProps, Size } from './types';

// ── Hooks ──────────────────────────────────────────────────────────────────
export { useFocusTrap, getFocusableElements } from './hooks/useFocusTrap';
export { useImpression } from './hooks/useImpression';
export type { UseImpressionOptions } from './hooks/useImpression';
export { useLockBodyScroll } from './hooks/useLockBodyScroll';
export {
  useIsTouchDevice,
  useMediaQuery,
  usePrefersReducedMotion,
} from './hooks/useMediaPreferences';
export { useOnClickOutside } from './hooks/useOnClickOutside';

// ── Primitives ─────────────────────────────────────────────────────────────
export { Avatar, AVATAR_PX, getAvatarColor, getInitials } from './components/Avatar';
export type { AvatarProps, AvatarSize } from './components/Avatar';

export { Badge } from './components/Badge';
export type { BadgeProps, BadgeVariant } from './components/Badge';

export { Button } from './components/Button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './components/Button';

export { Checkbox } from './components/Checkbox';
export type { CheckboxProps } from './components/Checkbox';

export { Chip } from './components/Chip';
export type { ChipProps } from './components/Chip';

export { DropdownMenu } from './components/DropdownMenu';
export type {
  DropdownMenuItem,
  DropdownMenuProps,
  DropdownTriggerRenderProps,
} from './components/DropdownMenu';

export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps } from './components/EmptyState';

export {
  Field,
  FIELD_CONTROL_CLASS,
  FIELD_ERROR_CLASS,
  useFieldIds,
} from './components/Field';
export type { FieldBaseProps, FieldIds, FieldProps } from './components/Field';

export { IconButton } from './components/IconButton';
export type {
  IconButtonProps,
  IconButtonSize,
  IconButtonVariant,
} from './components/IconButton';

export { Input } from './components/Input';
export type { InputProps, InputSize } from './components/Input';

export { KelvynLogo } from './components/Logo';
export type { KelvynLogoProps } from './components/Logo';

export { Modal } from './components/Modal';
export type { ModalProps, ModalSize } from './components/Modal';

export { ProgressBar } from './components/ProgressBar';
export type { ProgressBarProps, ProgressVariant } from './components/ProgressBar';

export { RichText } from './components/RichText';
export type { RichTextProps } from './components/RichText';

export { Select } from './components/Select';
export type { SelectOption, SelectProps } from './components/Select';

export { Sheet } from './components/Sheet';
export type { SheetProps, SheetSide } from './components/Sheet';

export { Skeleton } from './components/Skeleton';
export type { SkeletonProps, SkeletonVariant } from './components/Skeleton';

export { Slider } from './components/Slider';
export type { SliderProps } from './components/Slider';

export { Spinner } from './components/Spinner';
export type { SpinnerProps } from './components/Spinner';

export { Switch } from './components/Switch';
export type { SwitchProps } from './components/Switch';

export { Tabs } from './components/Tabs';
export type { TabItem, TabsProps } from './components/Tabs';

export { Textarea } from './components/Textarea';
export type { TextareaProps } from './components/Textarea';

export { Toast, ToastProvider, useToast } from './components/Toast';
export type {
  ToastContextValue,
  ToastItem,
  ToastOptions,
  ToastProps,
  ToastProviderProps,
  ToastVariant,
} from './components/Toast';

export { Tooltip } from './components/Tooltip';
export type { TooltipProps, TooltipSide } from './components/Tooltip';

export { VerifiedBadge } from './components/VerifiedBadge';
export type { VerifiedBadgeProps } from './components/VerifiedBadge';

// ── Composants métier ──────────────────────────────────────────────────────
export { BottomNav, DEFAULT_BOTTOM_NAV_ITEMS } from './components/BottomNav';
export type { BottomNavItem, BottomNavProps } from './components/BottomNav';

export { buildChannelHref, ChannelAvatar } from './components/ChannelAvatar';
export type { ChannelAvatarProps } from './components/ChannelAvatar';

export { CommentItem } from './components/CommentItem';
export type { CommentCallbacks, CommentItemProps } from './components/CommentItem';

export { CommentThread } from './components/CommentThread';
export type { CommentThreadProps } from './components/CommentThread';

export { FilterChips } from './components/FilterChips';
export type { FilterChip, FilterChipsProps } from './components/FilterChips';

export { HashtagList } from './components/HashtagList';
export type { HashtagListProps } from './components/HashtagList';

export { LikeBar } from './components/LikeBar';
export type { LikeBarProps } from './components/LikeBar';

export {
  DEFAULT_RAIL_ITEMS,
  DEFAULT_SIDEBAR_FOOTER_LINKS,
  DEFAULT_SIDEBAR_SECTIONS,
  Sidebar,
} from './components/Sidebar';
export type {
  SidebarItem,
  SidebarProps,
  SidebarSection,
} from './components/Sidebar';

export { StatCard } from './components/StatCard';
export type { StatCardProps } from './components/StatCard';

export { SubscribeButton } from './components/SubscribeButton';
export type { SubscribeButtonProps } from './components/SubscribeButton';

export { ThumbnailPicker } from './components/ThumbnailPicker';
export type { ThumbnailPickerProps } from './components/ThumbnailPicker';

export { TopBar } from './components/TopBar';
export type { TopBarProps, TopBarUser } from './components/TopBar';

export {
  buildVideoMenuItems,
  buildWatchHref,
  VideoCard,
} from './components/VideoCard';
export type {
  VideoCardLayout,
  VideoCardProps,
  VideoMenuAction,
} from './components/VideoCard';

export { VideoCardSkeleton } from './components/VideoCardSkeleton';
export type { VideoCardSkeletonProps } from './components/VideoCardSkeleton';
