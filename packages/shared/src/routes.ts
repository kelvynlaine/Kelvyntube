import { API_PREFIX } from './constants.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CARTE DES ROUTES REST — contrat unique API ↔ Web.
 *  Chaque agent de module implémente / consomme exactement ces chemins.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const ROUTES = {
  auth: {
    register: `${API_PREFIX}/auth/register`,
    login: `${API_PREFIX}/auth/login`,
    logout: `${API_PREFIX}/auth/logout`,
    refresh: `${API_PREFIX}/auth/refresh`,
    me: `${API_PREFIX}/auth/me`,
    verifyEmail: `${API_PREFIX}/auth/verify-email`,
    resendVerification: `${API_PREFIX}/auth/resend-verification`,
    requestPasswordReset: `${API_PREFIX}/auth/password/request-reset`,
    resetPassword: `${API_PREFIX}/auth/password/reset`,
    onboarding: `${API_PREFIX}/auth/onboarding`,
    profile: `${API_PREFIX}/auth/profile`,
    googleStart: `${API_PREFIX}/auth/oauth/google`,
    googleCallback: `${API_PREFIX}/auth/oauth/google/callback`,
    switchChannel: (channelId: string) => `${API_PREFIX}/auth/channels/${channelId}/activate`,
  },

  channels: {
    list: `${API_PREFIX}/channels`,
    create: `${API_PREFIX}/channels`,
    mine: `${API_PREFIX}/channels/mine`,
    byHandle: (handle: string) => `${API_PREFIX}/channels/handle/${handle}`,
    byId: (id: string) => `${API_PREFIX}/channels/${id}`,
    update: (id: string) => `${API_PREFIX}/channels/${id}`,
    videos: (id: string) => `${API_PREFIX}/channels/${id}/videos`,
    shorts: (id: string) => `${API_PREFIX}/channels/${id}/shorts`,
    playlists: (id: string) => `${API_PREFIX}/channels/${id}/playlists`,
    posts: (id: string) => `${API_PREFIX}/channels/${id}/posts`,
    subscribe: (id: string) => `${API_PREFIX}/channels/${id}/subscribe`,
    unsubscribe: (id: string) => `${API_PREFIX}/channels/${id}/subscribe`,
    checkHandle: `${API_PREFIX}/channels/check-handle`,
    uploadAsset: (id: string) => `${API_PREFIX}/channels/${id}/assets`, // avatar / bannière
  },

  videos: {
    byId: (id: string) => `${API_PREFIX}/videos/${id}`,
    update: (id: string) => `${API_PREFIX}/videos/${id}`,
    delete: (id: string) => `${API_PREFIX}/videos/${id}`,
    related: (id: string) => `${API_PREFIX}/videos/${id}/related`,
    like: (id: string) => `${API_PREFIX}/videos/${id}/like`,
    thumbnail: (id: string) => `${API_PREFIX}/videos/${id}/thumbnail`,
    captions: (id: string) => `${API_PREFIX}/videos/${id}/captions`,
    bulkUpdate: `${API_PREFIX}/videos/bulk`,
  },

  upload: {
    init: `${API_PREFIX}/upload/init`,
    chunk: (uploadId: string, index: number) => `${API_PREFIX}/upload/${uploadId}/chunk/${index}`,
    status: (uploadId: string) => `${API_PREFIX}/upload/${uploadId}/status`,
    complete: (uploadId: string) => `${API_PREFIX}/upload/${uploadId}/complete`,
    abort: (uploadId: string) => `${API_PREFIX}/upload/${uploadId}`,
  },

  views: {
    heartbeat: `${API_PREFIX}/views/heartbeat`,
    impressions: `${API_PREFIX}/views/impressions`,
    click: `${API_PREFIX}/views/click`,
    live: (videoId: string) => `${API_PREFIX}/views/${videoId}/live`,
  },

  comments: {
    list: (videoId: string) => `${API_PREFIX}/videos/${videoId}/comments`,
    create: (videoId: string) => `${API_PREFIX}/videos/${videoId}/comments`,
    replies: (commentId: string) => `${API_PREFIX}/comments/${commentId}/replies`,
    update: (commentId: string) => `${API_PREFIX}/comments/${commentId}`,
    delete: (commentId: string) => `${API_PREFIX}/comments/${commentId}`,
    like: (commentId: string) => `${API_PREFIX}/comments/${commentId}/like`,
    pin: (commentId: string) => `${API_PREFIX}/comments/${commentId}/pin`,
    heart: (commentId: string) => `${API_PREFIX}/comments/${commentId}/heart`,
    react: (commentId: string) => `${API_PREFIX}/comments/${commentId}/reactions`,
    moderation: (channelId: string) => `${API_PREFIX}/studio/${channelId}/comments`,
  },

  subscriptions: {
    list: `${API_PREFIX}/subscriptions`,
    feed: `${API_PREFIX}/subscriptions/feed`,
    updateLevel: (channelId: string) => `${API_PREFIX}/subscriptions/${channelId}/level`,
  },

  notifications: {
    list: `${API_PREFIX}/notifications`,
    unreadCount: `${API_PREFIX}/notifications/unread-count`,
    markRead: (id: string) => `${API_PREFIX}/notifications/${id}/read`,
    markAllRead: `${API_PREFIX}/notifications/read-all`,
  },

  feed: {
    home: `${API_PREFIX}/feed/home`,
    trending: `${API_PREFIX}/feed/trending`,
    shorts: `${API_PREFIX}/feed/shorts`,
    categories: `${API_PREFIX}/feed/categories`,
  },

  library: {
    history: `${API_PREFIX}/library/history`,
    clearHistory: `${API_PREFIX}/library/history`,
    liked: `${API_PREFIX}/library/liked`,
    watchLater: `${API_PREFIX}/library/watch-later`,
  },

  playlists: {
    list: `${API_PREFIX}/playlists`,
    create: `${API_PREFIX}/playlists`,
    byId: (id: string) => `${API_PREFIX}/playlists/${id}`,
    update: (id: string) => `${API_PREFIX}/playlists/${id}`,
    delete: (id: string) => `${API_PREFIX}/playlists/${id}`,
    addItem: (id: string) => `${API_PREFIX}/playlists/${id}/items`,
    removeItem: (id: string, videoId: string) => `${API_PREFIX}/playlists/${id}/items/${videoId}`,
    reorder: (id: string) => `${API_PREFIX}/playlists/${id}/reorder`,
  },

  search: {
    query: `${API_PREFIX}/search`,
    suggest: `${API_PREFIX}/search/suggest`,
  },

  tags: {
    trending: `${API_PREFIX}/tags/trending`,
    byName: (name: string) => `${API_PREFIX}/tags/${name}`,
    videos: (name: string) => `${API_PREFIX}/tags/${name}/videos`,
    suggest: `${API_PREFIX}/tags/suggest`,
  },

  studio: {
    overview: (channelId: string) => `${API_PREFIX}/studio/${channelId}/overview`,
    videos: (channelId: string) => `${API_PREFIX}/studio/${channelId}/videos`,
    videoAnalytics: (channelId: string, videoId: string) =>
      `${API_PREFIX}/studio/${channelId}/videos/${videoId}/analytics`,
    subscribers: (channelId: string) => `${API_PREFIX}/studio/${channelId}/subscribers`,
    comments: (channelId: string) => `${API_PREFIX}/studio/${channelId}/comments`,
    realtime: (channelId: string) => `${API_PREFIX}/studio/${channelId}/realtime`,
  },

  health: `${API_PREFIX}/health`,
  ws: '/ws',
} as const;
