document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const config = {
        audio: 'assets/music_background.mp3',
        scenes: [
            // 1. Chaos Intro (Problem) - Side by Side
            {
                type: 'intro-chaos',
                layout: 'layout-intro-chaos',
                duration: 8, // Increased duration for slower playback
                srcs: ['assets/intro0.mp4', 'assets/intro1.mp4'],
                title: "Your Calendar is Chaos.",
                subtitle: "Overlapping meetings. Missed events. Total overwhelm.",
                narrator: { text: "Oh dear... look at this mess.", pos: 'hidden' }
            },
            // 2. The Solution Reveal (Zoom)
            {
                type: 'intro-zoom',
                layout: 'layout-intro-zoom',
                duration: 15, // 15 seconds
                src: 'assets/intro2.mp4',
                asset: 'assets/intro2.mp4',
                title: "Meet <span class='highlight'>Micromanager</span>",
                subtitle: "Your proactive, intelligent calendar assistant.",
                narrator: {
                    text: "Allow me to introduce myself.",
                    pos: 'pos-center-zoom',
                    delay: 3000, // Wait 3s before zooming in
                    slowEntry: true
                }
            },
            // 3. The Solution Triad
            {
                type: 'intro-triad',
                layout: 'layout-intro-triad',
                duration: 8,
                srcs: ['assets/intro3.mp4', 'assets/daily-calendar-summary-message.png', 'assets/intro4.mp4'],
                title: "Order from Chaos",
                subtitle: "Micromanager brings structure to your day.",
                narrator: { text: "I tidy things up.", pos: 'pos-bottom-right' }
            },
            // 4. Telegram Integration
            {
                type: 'video',
                layout: 'layout-split-right',
                src: 'assets/1_fetchevents.mp4',
                title: "Right in Telegram",
                subtitle: "No new apps. Just DM @micromanager_agentbot.",
                narrator: { text: "I live where you chat.", pos: 'pos-bottom-right' }
            },
            // 5. Proactive Notifications
            {
                type: 'image',
                layout: 'layout-split-left',
                src: 'assets/notification-meeting-moved.png',
                duration: 5,
                title: "Always Aware",
                subtitle: "Meeting moved? I know before you do.",
                narrator: { text: "I'm always watching.", pos: 'pos-top-left' }
            },
            {
                type: 'image',
                layout: 'layout-split-left',
                src: 'assets/notification-conflict.png',
                duration: 5,
                title: "Problem Solver",
                subtitle: "I propose solutions instantly.",
                narrator: { text: "Leave the hard work to me.", pos: 'pos-bottom-right' }
            },
            // 6. Adding Tasks
            {
                type: 'video',
                layout: 'layout-hero',
                src: 'assets/4_createtask.mp4',
                title: "Just Ask",
                subtitle: "Powered by GPT-5. Talk to me like a human.",
                narrator: { text: "Just say the word.", pos: 'pos-bottom-left' }
            },
            // 7. Voice Interaction
            {
                type: 'video',
                layout: 'layout-split-right',
                src: 'assets/5_realtimevoice.mp4',
                title: "Voice Enabled",
                subtitle: "On the run? Start a voice chat for hands-free calendar management (paid plan only).",
                narrator: { text: "I'm a good listener.", pos: 'pos-top-right' }
            },
            // 8. Intelligent Decision
            {
                type: 'video',
                layout: 'layout-split-left',
                src: 'assets/2_addevent.mp4',
                title: "The Brain",
                subtitle: "Orchestrated by OpenAI Agents SDK. Deep integration via Google Calendar MCP and our custom tools.",
                narrator: { text: "I connect the dots.", pos: 'pos-top-left' }
            },
            // 9. Conflict Resolution
            {
                type: 'video',
                layout: 'layout-hero',
                src: 'assets/3_conflictresolution.mp4',
                title: "Conflict Resolution",
                subtitle: "I negotiate so you don't have to.",
                narrator: { text: "Conflict resolved.", pos: 'pos-top-right' }
            },
            // 10. Weekend Wrap-Up
            {
                type: 'video',
                layout: 'layout-center',
                src: 'assets/6_workplan.mp4',
                title: "Stay Ahead",
                subtitle: "Weekly summaries and intelligent work plans.",
                narrator: { text: "Ready for next week?", pos: 'pos-center-zoom' }
            },
            // 11. Roadmap
            {
                type: 'roadmap',
                layout: 'layout-roadmap',
                duration: 8,
                title: "Future Integrations",
                items: [
                    "Slack Integration",
                    "Notion Knowledge Base",
                    "Linear Issue Tracking",
                    "Gmail Context Awareness"
                ],
                narrator: { text: "I'm only getting smarter.", pos: 'pos-center-zoom' }
            },
            // 12. Closing
            {
                type: 'closing',
                layout: 'layout-center layout-closing',
                src: 'assets/micromanager_logo.png',
                videoSrc: 'assets/tg_qr.mp4',
                duration: 5,
                title: "Micromanager",
                subtitle: "Your calendar's new brain. Available now.",
                narrator: { text: "See you soon.", pos: 'pos-center-zoom' }
            }
        ]
    };

    // --- Elements ---
    const scrollContainer = document.getElementById('scroll-container');
    const narratorLogo = document.getElementById('narrator-logo');
    const speechBubble = narratorLogo.querySelector('.speech-bubble');

    // --- State ---
    let audio = null;
    let isDemoMode = false;
    let observer = null;
    let autoplayOverlay = null;

    // --- Initialization ---
    init();

    function init() {
        renderScenes();
        setupObserver();

        // URL Navigation and Autoplay Detection
        const urlParams = new URLSearchParams(window.location.search);
        const shouldAutoplay = urlParams.get('autoplay') === 'true';
        const sceneIndex = urlParams.get('scene');

        if (shouldAutoplay) {
            // Create and show autoplay overlay
            createAutoplayOverlay();
        }

        if (sceneIndex !== null && !shouldAutoplay) {
            const index = parseInt(sceneIndex);
            if (!isNaN(index)) {
                // Wait a bit for rendering
                setTimeout(() => {
                    const section = document.querySelector(`section[data-index="${index}"]`);
                    if (section) {
                        section.scrollIntoView();
                        // Manually trigger activation if observer doesn't catch it immediately
                        activateSection(section);
                    }
                }, 100);
            }
        }
    }

    function createAutoplayOverlay() {
        autoplayOverlay = document.createElement('div');
        autoplayOverlay.id = 'autoplay-overlay';
        autoplayOverlay.innerHTML = `
            <div class="autoplay-content">
                <div class="autoplay-icon">▶</div>
                <p class="autoplay-text">Click anywhere to start demo</p>
            </div>
        `;
        document.body.appendChild(autoplayOverlay);

        // Trigger demo on any click
        const handleClick = () => {
            autoplayOverlay.classList.add('fade-out');
            setTimeout(() => {
                autoplayOverlay.remove();
                autoplayOverlay = null;
            }, 300);
            startDemoMode();
            autoplayOverlay.removeEventListener('click', handleClick);
        };

        autoplayOverlay.addEventListener('click', handleClick);
    }

    function renderScenes() {
        config.scenes.forEach((scene, index) => {
            const section = document.createElement('section');
            section.className = scene.layout || 'layout-center';
            section.dataset.index = index;
            section.dataset.duration = scene.duration || (scene.type === 'video' ? 'auto' : 5);

            // Asset Wrapper
            const assetWrapper = document.createElement('div');
            assetWrapper.className = 'asset-wrapper';

            if (scene.type === 'intro-chaos') {
                scene.srcs.forEach(src => {
                    const video = createVideo(src, 0.5); // 50% speed
                    assetWrapper.appendChild(video);
                });
                // Blur removed as requested

            } else if (scene.type === 'intro-zoom') {
                const video = createVideo(scene.src, 1, false); // No loop
                assetWrapper.appendChild(video);
            } else if (scene.type === 'intro-triad') {
                // Video | Image | Video
                assetWrapper.appendChild(createVideo(scene.srcs[0]));

                const img = document.createElement('div');
                img.className = 'image-overlay';
                img.style.backgroundImage = `url('${scene.srcs[1]}')`;
                assetWrapper.appendChild(img);

                assetWrapper.appendChild(createVideo(scene.srcs[2]));
            } else if (scene.type === 'video') {
                assetWrapper.appendChild(createVideo(scene.src));
            } else if (scene.type === 'image') {
                const img = document.createElement('div');
                img.className = 'image-overlay';
                img.style.backgroundImage = `url('${scene.src}')`;
                assetWrapper.appendChild(img);
            } else if (scene.type === 'closing') {
                // Logo image at top
                const img = document.createElement('div');
                img.className = 'image-overlay closing-logo';
                img.style.backgroundImage = `url('${scene.src}')`;
                assetWrapper.appendChild(img);
            }

            // Text Wrapper
            const textWrapper = document.createElement('div');
            textWrapper.className = 'text-wrapper';

            if (scene.type === 'roadmap') {
                const content = document.createElement('div');
                content.className = 'text-content';
                content.innerHTML = `<h2>${scene.title}</h2><ul class="roadmap-list">${scene.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
                textWrapper.appendChild(content);
            } else if (scene.type === 'closing') {
                const h2 = document.createElement('h2');
                h2.textContent = scene.title;
                textWrapper.appendChild(h2);
                if (scene.subtitle) {
                    const p = document.createElement('p');
                    p.className = 'subtitle';
                    p.textContent = scene.subtitle;
                    textWrapper.appendChild(p);
                }

                // QR Code for Closing Scene
                if (scene.videoSrc) {
                    const qrVideo = document.createElement('video');
                    qrVideo.src = scene.videoSrc;
                    qrVideo.autoplay = true;
                    qrVideo.loop = true;
                    qrVideo.muted = true;
                    qrVideo.playsInline = true;
                    qrVideo.className = 'qr-code';
                    textWrapper.appendChild(qrVideo);
                }
            } else {
                const content = document.createElement('div');
                content.className = 'text-content';
                content.innerHTML = `<h2>${scene.title}</h2><p class="subtitle">${scene.subtitle}</p>`;
                textWrapper.appendChild(content);
            }

            section.appendChild(assetWrapper);
            section.appendChild(textWrapper);

            scrollContainer.appendChild(section);
        });
    }

    function createVideo(src, playbackRate = 1, loop = true) {
        const video = document.createElement('video');
        video.src = src;
        video.muted = true;
        video.playsInline = true;
        video.loop = loop;
        video.playbackRate = playbackRate;
        return video;
    }

    function setupObserver() {
        const options = {
            root: scrollContainer,
            threshold: 0.5
        };

        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    activateSection(entry.target);
                } else {
                    deactivateSection(entry.target);
                }
            });
        }, options);

        document.querySelectorAll('section').forEach(section => {
            observer.observe(section);
        });
    }

    function activateSection(section) {
        section.classList.add('active');
        const videos = section.querySelectorAll('video');
        videos.forEach(v => {
            v.currentTime = 0;
            v.play().catch(e => console.log("Autoplay blocked", e));
        });

        // Update Narrator
        const index = parseInt(section.dataset.index);
        const sceneConfig = config.scenes[index];
        updateNarrator(sceneConfig);

        // Handle Intro Zoom Logic
        if (sceneConfig.type === 'intro-zoom') {
            section.classList.add('zooming');
            section.classList.remove('show-text');

            // Timeline:
            // T+0: Scene Start
            // T+3: Logo starts slow entry (delay 3000)
            // T+8: Logo finishes zooming (3s delay + 5s transition)
            // T+4.5: Text fades in (was 5.5, now 1s earlier)
            // T+8: Bubble fades in (3s delay + 5s bubble delay)

            // Delay zooming class slightly to ensure start state is rendered
            requestAnimationFrame(() => {
                section.classList.add('zooming');
            });

            setTimeout(() => {
                section.classList.add('show-text');
            }, 4500);
        }
    }

    function deactivateSection(section) {
        section.classList.remove('active');
        section.classList.remove('zooming'); // Reset zoom
        section.classList.remove('show-text');

        const videos = section.querySelectorAll('video');
        videos.forEach(v => v.pause());
    }

    function updateNarrator(sceneConfig) {
        if (!sceneConfig.narrator) return;

        const { text, pos, delay, slowEntry } = sceneConfig.narrator;

        // Reset classes
        narratorLogo.className = '';
        narratorLogo.classList.remove('show-bubble');
        narratorLogo.classList.remove('slow-entry');

        if (pos === 'hidden') {
            narratorLogo.classList.add('hidden');
            return;
        }

        // Apply position class
        // If there is a delay (like in intro zoom), wait before showing
        if (delay) {
            narratorLogo.classList.add('hidden'); // Start hidden
            setTimeout(() => {
                narratorLogo.classList.remove('hidden');

                // Force reflow to ensure transition plays
                void narratorLogo.offsetWidth;

                narratorLogo.classList.add('visible');
                narratorLogo.classList.add(pos);
                if (slowEntry) narratorLogo.classList.add('slow-entry');

                // Show bubble after logo appears
                setTimeout(() => {
                    speechBubble.textContent = text;
                    narratorLogo.classList.add('show-bubble');
                }, 5000); // Bubble appears at 5s (after delay)
            }, delay);
        } else {
            // Force reflow to ensure transition plays if coming from hidden/scale(0)
            // Remove all position classes first to ensure clean state
            narratorLogo.className = '';
            narratorLogo.classList.add('hidden'); // Start hidden

            if (slowEntry) {
                void narratorLogo.offsetWidth; // Trigger reflow
                narratorLogo.classList.remove('hidden');
                narratorLogo.classList.add('slow-entry');
            } else {
                narratorLogo.classList.remove('hidden');
            }

            // Add visible and position class after a tiny tick to allow transition to catch
            requestAnimationFrame(() => {
                narratorLogo.classList.add('visible');
                narratorLogo.classList.add(pos);
            });

            // Update text and show bubble
            speechBubble.textContent = text;
            // Small delay for bubble pop
            setTimeout(() => {
                narratorLogo.classList.add('show-bubble');
            }, 500);
        }
    }

    // --- Demo Mode (Auto-Scroll) ---
    async function startDemoMode() {
        isDemoMode = true;
        document.body.classList.add('demo-mode');

        audio = new Audio(config.audio);
        audio.loop = true;
        audio.volume = 0.5;
        audio.play().catch(e => console.warn("Audio play failed", e));

        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });

        const sections = document.querySelectorAll('section');
        for (let i = 0; i < sections.length; i++) {
            await playSectionInDemoMode(sections[i]);
        }

        finishDemo();
    }

    function playSectionInDemoMode(section) {
        return new Promise(resolve => {
            section.scrollIntoView({ behavior: 'smooth' });

            setTimeout(() => {
                const duration = getDuration(section);
                console.log(`Playing section ${section.dataset.index} for ${duration}s`);

                setTimeout(() => {
                    resolve();
                }, duration * 1000);
            }, 1000);
        });
    }

    function getDuration(section) {
        // If chaos intro or zoom, use defined duration
        if (section.classList.contains('layout-intro-chaos') || section.classList.contains('layout-intro-zoom')) {
            return parseFloat(section.dataset.duration) || 6;
        }

        const video = section.querySelector('video');
        if (video && !isNaN(video.duration) && video.duration > 0) {
            return video.duration;
        }
        const defined = parseFloat(section.dataset.duration);
        if (!isNaN(defined)) return defined;
        return 5;
    }

    function finishDemo() {
        console.log("Demo finished");

        const fadeAudio = setInterval(() => {
            if (audio.volume > 0.05) {
                audio.volume -= 0.05;
            } else {
                clearInterval(fadeAudio);
                audio.pause();
            }
        }, 200);

        setTimeout(() => {
            document.body.classList.remove('demo-mode');
            isDemoMode = false;

            // Show replay overlay
            createReplayOverlay();
        }, 2000);
    }

    function createReplayOverlay() {
        autoplayOverlay = document.createElement('div');
        autoplayOverlay.id = 'autoplay-overlay';
        autoplayOverlay.innerHTML = `
            <div class="autoplay-content">
                <div class="autoplay-icon">↺</div>
                <p class="autoplay-text">Click anywhere to replay demo</p>
            </div>
        `;
        document.body.appendChild(autoplayOverlay);

        // Trigger demo on any click
        const handleClick = () => {
            autoplayOverlay.classList.add('fade-out');
            setTimeout(() => {
                autoplayOverlay.remove();
                autoplayOverlay = null;
            }, 300);
            startDemoMode();
            autoplayOverlay.removeEventListener('click', handleClick);
        };

        autoplayOverlay.addEventListener('click', handleClick);
    }
});
