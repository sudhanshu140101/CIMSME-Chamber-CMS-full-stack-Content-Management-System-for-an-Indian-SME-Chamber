(function () {
    'use strict';

    const CACHE_KEY = 'cimsme_cache_positiveTalk';
    const CACHE_DURATION = 5 * 60 * 1000;
    const CATEGORY_PROMO = 'promo';
    const CATEGORY_FULL = 'full_episode';

    const PROMO_HEADING = 'Positive Talk With Mukesh Mohan Gupta Promo Videos';
    const FULL_HEADING = 'Positive Talk With Mukesh Mohan Gupta Full Episodes';

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function extractYouTubeVideoId(url) {
        if (!url || typeof url !== 'string') return null;
        const trimmed = url.trim();
        const patterns = [
            /(?:youtube\.com\/watch\?(?:[^&]*&)*v=|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
        ];
        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    }

    function getYouTubeWatchUrl(videoId) {
        return `https://www.youtube.com/watch?v=${videoId}`;
    }

    function getYouTubeEmbedUrl(videoId) {
        const params = new URLSearchParams({
            autoplay: '1',
            rel: '0',
            modestbranding: '1',
            playsinline: '1'
        });
        if (window.location && window.location.origin) {
            params.set('origin', window.location.origin);
        }
        return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
    }

    function getCachedData() {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (!cached) return null;
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp > CACHE_DURATION) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    function setCachedData(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        } catch {
            /* ignore quota errors */
        }
    }

    function getSortTime(item) {
        const videoDate = item.video_date ? new Date(`${String(item.video_date).slice(0, 10)}T12:00:00`).getTime() : NaN;
        if (Number.isFinite(videoDate)) return videoDate;
        return new Date(item.created_at || 0).getTime();
    }

    function sortByDateDesc(items) {
        return [...items].sort((a, b) => {
            const dateA = getSortTime(a);
            const dateB = getSortTime(b);
            if (dateB !== dateA) return dateB - dateA;
            return (b.id || 0) - (a.id || 0);
        });
    }

    function createVideoCard(video) {
        const div = document.createElement('div');
        div.className = 'bg-white rounded-2xl overflow-hidden shadow-lg card-hover transition-all duration-300 hover:shadow-xl';

        const videoId = video.youtube_video_id || extractYouTubeVideoId(video.youtube_url);
        if (!videoId) return div;

        const playerId = `positive-talk-player-${video.id}`;
        const safeTitle = escapeHtml(video.title);
        const safeTitleAttr = safeTitle.replace(/"/g, '&quot;');
        const thumbPrimary = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const thumbFallback = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const watchUrl = getYouTubeWatchUrl(videoId);

        div.innerHTML = `
            <div class="relative h-48 md:h-56 bg-gray-900 overflow-hidden" id="${playerId}" data-video-id="${videoId}" data-title="${safeTitleAttr}">
                <button type="button" class="positive-talk-play absolute inset-0 w-full h-full group focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2" aria-label="Play video: ${safeTitleAttr}" data-player-id="${playerId}">
                    <img
                        src="${thumbPrimary}"
                        alt="Thumbnail for ${safeTitleAttr}"
                        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                        referrerpolicy="no-referrer"
                        onerror="this.onerror=null;this.src='${thumbFallback}'"
                    >
                    <span class="absolute inset-0 bg-black bg-opacity-30 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                        <span class="w-10 h-10 md:w-12 md:h-12 bg-red-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                            <svg class="w-8 h-8 md:w-10 md:h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                        </span>
                    </span>
                </button>
            </div>
            <div class="p-6">
                <h3 class="text-lg md:text-xl font-bold text-gray-900 mb-4 line-clamp-2">${safeTitle}</h3>
                <a href="${watchUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-red-600 hover:text-red-800 font-semibold text-sm group" aria-label="Watch ${safeTitleAttr} on YouTube (opens in new tab)">
                    Watch Complete Video
                    <svg class="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
            </div>
        `;
        return div;
    }

    function playVideoInline(playerId) {
        const container = document.getElementById(playerId);
        if (!container || container.querySelector('iframe')) return;

        const videoId = container.getAttribute('data-video-id');
        const title = container.getAttribute('data-title') || 'Positive Talk video';
        if (!videoId) return;

        const safeTitle = escapeHtml(title);
        const embedSrc = getYouTubeEmbedUrl(videoId);
        container.innerHTML = `
            <iframe
                src="${embedSrc}"
                title="${safeTitle}"
                class="absolute top-0 left-0 w-full h-full"
                frameborder="0"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen>
            </iframe>
        `;
    }

    function renderEmptyState(container, message) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12">
                <div class="text-gray-400 text-6xl mb-4">🎙️</div>
                <p class="text-gray-500 text-lg">${escapeHtml(message)}</p>
            </div>
        `;
    }

    function renderSection(container, videos, emptyMessage) {
        if (!container) return;
        container.innerHTML = '';

        if (!videos.length) {
            renderEmptyState(container, emptyMessage);
            return;
        }

        videos.forEach(item => {
            const card = createVideoCard(item);
            if (card.innerHTML) container.appendChild(card);
        });
    }

    function displayVideos(allVideos) {
        const promoContainer = document.getElementById('promoVideosContainer');
        const fullContainer = document.getElementById('fullEpisodesContainer');
        const promoVideos = sortByDateDesc(allVideos.filter(v => v.category === CATEGORY_PROMO));
        const fullVideos = sortByDateDesc(allVideos.filter(v => v.category === CATEGORY_FULL));

        renderSection(promoContainer, promoVideos, 'No promo videos available at the moment.');
        renderSection(fullContainer, fullVideos, 'No full episodes available at the moment.');
    }

    async function loadPositiveTalkVideos() {
        const loading = document.getElementById('positiveTalkLoading');
        const errorDiv = document.getElementById('positiveTalkError');
        const content = document.getElementById('positiveTalkContent');

        try {
            const cached = getCachedData();
            if (cached) {
                if (loading) loading.classList.add('hidden');
                if (content) content.classList.remove('hidden');
                displayVideos(cached);
                window.apiCall('/positive-talk').then(response => {
                    if (response && response.data) {
                        setCachedData(response.data);
                        displayVideos(response.data);
                    }
                }).catch(() => { /* background refresh */ });
                return;
            }

            const response = await window.apiCall('/positive-talk');
            const videos = response.data || [];
            setCachedData(videos);

            if (loading) loading.classList.add('hidden');
            if (errorDiv) errorDiv.classList.add('hidden');
            if (content) content.classList.remove('hidden');
            displayVideos(videos);
        } catch (error) {
            console.error('Failed to load Positive Talk videos:', error);
            if (loading) loading.classList.add('hidden');
            if (errorDiv) errorDiv.classList.remove('hidden');
            if (content) content.classList.add('hidden');
        }
    }

    document.addEventListener('click', function (event) {
        const playBtn = event.target.closest('.positive-talk-play');
        if (!playBtn) return;
        event.preventDefault();
        event.stopPropagation();
        const playerId = playBtn.getAttribute('data-player-id');
        if (playerId) playVideoInline(playerId);
    });

    document.addEventListener('DOMContentLoaded', loadPositiveTalkVideos);

    window.PositiveTalkPage = {
        PROMO_HEADING,
        FULL_HEADING
    };
})();
