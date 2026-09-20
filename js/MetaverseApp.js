import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MetaverseOnlineClient } from "./MetaverseOnlineClient.js?v=5";
import { MetaverseTitleScreen } from "./MetaverseTitleScreen.js?v=1";
import { WorldNotificationCenter } from "./WorldNotificationCenter.js?v=1";
import { WorldChatPanel } from "./WorldChatPanel.js?v=3";
import { WhisperNotificationCenter } from "./WhisperNotificationCenter.js?v=1";

export class MetaverseApp {
    constructor({ canvas, loadingElement, statusElement, errorElement }) {
        this.canvas = canvas;
        this.loadingElement = loadingElement;
        this.statusElement = statusElement;
        this.errorElement = errorElement;
        this.clock = new THREE.Clock();
        this.elapsedTime = 0;
        this.animationFrameId = null;

        // ===== ショップ店内フィールドの追加部分 =====
        // 現在いるエリアを記録し、移動範囲や操作対象を切り替える。
        this.currentArea = "lobby";
        this.remotePlayers = new Map();
        this.chatBubbles = new Map();

        // ===== アバター移動の追加部分 =====
        // 押されているキーと移動に使う設定値を、アプリ全体で共有する。
        this.pressedMovementKeys = new Set();
        this.avatarMovementSpeed = 4.2;
        this.worldMovementLimit = 38;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05080d);
        this.scene.fog = new THREE.FogExp2(0x05080d, 0.010);
        this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 140);
        this.camera.position.set(14, 10, 17);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "default"
            //まぁ省エネやね(笑)
            //powerPreference: "high-performance"
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.055;
        this.controls.target.set(0, 1.2, 0);
        this.controls.minDistance = 8;
        this.controls.maxDistance = 34;
        this.controls.minPolarAngle = Math.PI * 0.18;
        this.controls.maxPolarAngle = Math.PI * 0.47;
        this.controls.enablePan = false;
        this.controls.update();

        this.createLights();
        this.createFloor();
        this.createSpawnPlatform();

        // ===== アバター表示の追加部分 =====
        // 中央プラットフォームの上に、操作前のプレイヤーアバターを配置する。
        this.createAvatar();

        // ===== アバター移動の追加部分 =====
        // アバター生成後に、キーボード入力の監視を開始する。
        this.bindMovementControls();

        // ===== デュエルテーブル表示の追加部分 =====
        // 初期地点の奥に、次回デュエル開始地点として使うテーブルを配置する。
        this.createDuelTable();

        // ===== デュエルショップ表示の追加部分 =====
        // ロビー内に、今後カード購入画面へ接続するショップを配置する。
        this.createDuelShop();

        this.createBoundaryMarkers();

        // 店内へ移動した時に隠す、ロビー側の3Dオブジェクトを記録する。
        this.lobbyEnvironmentObjects = this.scene.children.filter(object =>
            object !== this.avatar && !object.isLight
        );

        // ===== ショップ店内フィールドの追加部分 =====
        // ロビーから離れた座標に、独立した店内フィールドを作る。
        this.createShopInterior();
        this.bindWorldInteractions();
        this.initializePackShop();

        // ===== PSO2風オンラインチャットの追加部分 =====
        this.chatPanel = new WorldChatPanel({
            element: document.getElementById("world-chat"),
            launcher: document.getElementById("world-chat-launcher"),
            unreadElement: document.getElementById("world-chat-unread"),
            logElement: document.getElementById("world-chat-log"),
            form: document.getElementById("world-chat-form"),
            input: document.getElementById("world-chat-input"),
            targetRow: document.getElementById("world-chat-target-row"),
            targetSelect: document.getElementById("world-chat-target"),
            channelButtons: document.querySelectorAll("[data-chat-channel]"),
            closeButton: document.getElementById("world-chat-close"),
            onSend: message => this.onlineClient.sendChatMessage(message)
        });
        this.chatBubbleContainer = document.getElementById("world-chat-bubbles");

        // ===== WHISPER通知の追加部分 =====
        // 相手から届いた個人チャットをベルへ蓄積し、選択時に返信欄を開く。
        this.whisperNotificationCenter = new WhisperNotificationCenter({
            button: document.getElementById("world-whisper-notification-button"),
            badge: document.getElementById("world-whisper-notification-badge"),
            panel: document.getElementById("world-whisper-notification-panel"),
            list: document.getElementById("world-whisper-notification-list"),
            emptyMessage: document.getElementById("world-whisper-notification-empty"),
            closeButton: document.getElementById("world-whisper-notification-close"),
            onOpenConversation: playerId => this.chatPanel.openWhisper(playerId)
        });

        // ===== オンライン入退室通知の追加部分 =====
        this.notificationCenter = new WorldNotificationCenter(
            document.getElementById("world-notifications")
        );

        // ===== オンライン接続基盤の追加部分 =====
        // 名前入力後にNode.jsサーバーへ接続し、プレイヤー情報と接続人数を受け取る。
        this.onlineClient = new MetaverseOnlineClient({
            container: document.getElementById("world-online-status"),
            stateElement: document.getElementById("world-online-state"),
            countElement: document.getElementById("world-online-count"),
            playerElement: document.getElementById("world-player-name"),
            getLocalState: () => this.getLocalPlayerState(),
            onWelcome: player => this.applyInitialOnlineSpawn(player),
            onPlayerJoined: player => this.handleRemotePlayerJoined(player),
            onPlayersSnapshot: players => this.syncRemotePlayers(players),
            onPlayerState: player => this.updateRemotePlayer(player),
            onPlayerLeft: player => this.handleRemotePlayerLeft(player),
            onChatMessage: message => this.handleChatMessage(message),
            onChatError: code => this.handleChatError(code)
        });
        this.onlineClient.setState("offline", "STANDBY");

        this.handleResize = () => this.resize();
        this.handleVisibilityChange = () => {
            if (document.hidden) this.stop();
            else this.start();
        };
        window.addEventListener("resize", this.handleResize);
        document.addEventListener("visibilitychange", this.handleVisibilityChange);

        this.resize();
        this.setReady();
        this.start();
    }

    /**
     * ===== プレイヤー名入力の追加部分 =====
     * タイトル画面で決めた名前を設定してから、オンラインサーバーへ接続する。
     */
    enterOnlineWorld(playerName) {
        this.onlineClient.setPlayerName(playerName);
        this.onlineClient.connect();
        this.pressedMovementKeys.clear();
    }

    /**
     * ===== オンライン出現位置の分散部分 =====
     * サーバーから割り当てられた初期位置へ、アバターとカメラを一緒に移動する。
     */
    applyInitialOnlineSpawn(player) {
        if (!this.avatar || player?.area !== "lobby") return;
        const spawnX = Number(player.position?.x);
        const spawnZ = Number(player.position?.z);
        const spawnRotationY = Number(player.rotationY);
        if (!Number.isFinite(spawnX) || !Number.isFinite(spawnZ)) return;

        const movement = new THREE.Vector3(
            spawnX - this.avatar.position.x,
            0,
            spawnZ - this.avatar.position.z
        );
        this.avatar.position.set(spawnX, this.avatarBaseY, spawnZ);
        if (Number.isFinite(spawnRotationY)) this.avatar.rotation.y = spawnRotationY;
        this.avatar.userData.isMoving = false;
        this.camera.position.add(movement);
        this.controls.target.add(movement);
        this.controls.update();
        this.chatPanel.setCurrentPlayer(player);
    }

    /**
     * ===== オンライン入退室通知の追加部分 =====
     * 新しく参加したプレイヤーを先に3D空間へ追加し、参加通知を表示する。
     */
    handleRemotePlayerJoined(player) {
        if (!player?.id) return;
        this.updateRemotePlayer(player);
        this.chatPanel.addPlayer(player);
        this.notificationCenter.show({
            type: "joined",
            playerName: player.name || "DUELIST"
        });
    }

    /**
     * ===== オンライン入退室通知の追加部分 =====
     * 退出者の名前を通知してから、対応する3Dアバターを取り除く。
     */
    handleRemotePlayerLeft(player) {
        if (!player?.id) return;
        const playerName = player.name || this.remotePlayers.get(player.id)?.name || "DUELIST";
        this.removeRemotePlayer(player.id);
        this.chatPanel.removePlayer(player.id);
        this.notificationCenter.show({
            type: "left",
            playerName
        });
    }

    /**
     * ===== PSO2風オンラインチャットの追加部分 =====
     * サーバーから届いた発言をログへ追加し、公開発言はアバター上にも表示する。
     */
    handleChatMessage(message) {
        this.chatPanel.addMessage(message);
        if (message?.channel === "whisper") {
            if (message.sender?.id !== this.onlineClient?.player?.id) {
                this.whisperNotificationCenter.notify(message);
            }
            return;
        }
        this.showChatBubble(message);
    }

    handleChatError(code) {
        const messages = {
            NOT_CONNECTED: "サーバーへ接続されていません",
            TOO_FAST: "送信間隔が短すぎます",
            TARGET_UNAVAILABLE: "送信相手が見つかりません",
            MESSAGE_TOO_LONG: "メッセージは120文字以内で入力してください",
            INVALID_CHANNEL: "発言先を確認してください",
            EMPTY_MESSAGE: "メッセージを入力してください"
        };
        this.chatPanel.addSystemMessage(messages[code] || "メッセージを送信できませんでした");
    }

    showChatBubble(message) {
        const playerId = message?.sender?.id;
        if (!playerId || !message.text || !this.chatBubbleContainer) return;
        this.removeChatBubble(playerId);

        const element = document.createElement("div");
        element.className = "world-chat-bubble";
        element.dataset.channel = message.channel;
        element.textContent = message.text;
        this.chatBubbleContainer.append(element);
        this.chatBubbles.set(playerId, {
            element,
            expiresAt: performance.now() + 5200
        });
    }

    removeChatBubble(playerId) {
        const bubble = this.chatBubbles.get(playerId);
        if (!bubble) return;
        bubble.element.remove();
        this.chatBubbles.delete(playerId);
    }

    updateChatBubbles() {
        if (!this.chatBubbleContainer) return;
        const now = performance.now();
        const canvasRect = this.canvas.getBoundingClientRect();
        const containerRect = this.chatBubbleContainer.getBoundingClientRect();

        this.chatBubbles.forEach((bubble, playerId) => {
            if (now >= bubble.expiresAt) {
                this.removeChatBubble(playerId);
                return;
            }

            let anchorObject = null;
            if (playerId === this.onlineClient?.player?.id) {
                anchorObject = this.avatar;
            } else {
                const remotePlayer = this.remotePlayers.get(playerId);
                if (remotePlayer?.area === this.currentArea && remotePlayer.container.visible) {
                    anchorObject = remotePlayer.container;
                }
            }
            if (!anchorObject) {
                bubble.element.hidden = true;
                return;
            }

            const screenPosition = new THREE.Vector3(0, 4.8, 0);
            anchorObject.localToWorld(screenPosition);
            screenPosition.project(this.camera);
            if (screenPosition.z < -1 || screenPosition.z > 1) {
                bubble.element.hidden = true;
                return;
            }

            bubble.element.hidden = false;
            bubble.element.style.left = `${canvasRect.left - containerRect.left + (screenPosition.x * 0.5 + 0.5) * canvasRect.width}px`;
            bubble.element.style.top = `${canvasRect.top - containerRect.top + (-screenPosition.y * 0.5 + 0.5) * canvasRect.height}px`;
        });
    }


    createLights() {
        const hemisphere = new THREE.HemisphereLight(0x9edce8, 0x11141b, 1.8);
        this.scene.add(hemisphere);

        const keyLight = new THREE.DirectionalLight(0xffe0a3, 3.2);
        keyLight.position.set(9, 15, 8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.left = -18;
        keyLight.shadow.camera.right = 18;
        keyLight.shadow.camera.top = 18;
        keyLight.shadow.camera.bottom = -18;
        this.scene.add(keyLight);

        const cyanLight = new THREE.PointLight(0x35d4df, 38, 22, 2);
        cyanLight.position.set(-6, 4, -3);
        this.scene.add(cyanLight);

        const amberLight = new THREE.PointLight(0xe2a33b, 26, 18, 2);
        amberLight.position.set(7, 3, 6);
        this.scene.add(amberLight);
    }

    createFloor() {
        const floorGeometry = new THREE.PlaneGeometry(80, 80);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x111821,
            roughness: 0.82,
            metalness: 0.25
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const grid = new THREE.GridHelper(80, 80, 0x2b8d98, 0x263744);
        grid.position.y = 0.012;
        grid.material.opacity = 0.42;
        grid.material.transparent = true;
        this.scene.add(grid);

        const axisGrid = new THREE.GridHelper(80, 8, 0xd09a3d, 0x000000);
        axisGrid.position.y = 0.018;
        axisGrid.material.opacity = 0.24;
        axisGrid.material.transparent = true;
        this.scene.add(axisGrid);
    }

    createSpawnPlatform() {
        const platform = new THREE.Group();

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(5.1, 5.5, 0.42, 8),
            new THREE.MeshStandardMaterial({ color: 0x151e28, metalness: 0.72, roughness: 0.34 })
        );
        base.position.y = 0.21;
        base.castShadow = true;
        base.receiveShadow = true;
        platform.add(base);

        const inset = new THREE.Mesh(
            new THREE.CylinderGeometry(4.35, 4.35, 0.08, 48),
            new THREE.MeshStandardMaterial({
                color: 0x102a31,
                emissive: 0x0b4750,
                emissiveIntensity: 0.9,
                metalness: 0.48,
                roughness: 0.28
            })
        );
        inset.position.y = 0.46;
        inset.receiveShadow = true;
        platform.add(inset);

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(3.75, 3.83, 96),
            new THREE.MeshBasicMaterial({ color: 0x6ee8ef, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.515;
        platform.add(ring);
        this.scanRing = ring;

        const core = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.22, 64),
            new THREE.MeshBasicMaterial({ color: 0xe8b04b, transparent: true, opacity: 0.78, side: THREE.DoubleSide })
        );
        core.rotation.x = -Math.PI / 2;
        core.position.y = 0.52;
        platform.add(core);

        this.scene.add(platform);
    }

    /**
     * ===== アバター表示の追加部分 =====
     * 基本図形を組み合わせ、中央プラットフォームに立つアバターを作成する。
     * 次の段階では、このGroup全体を動かすことで移動処理を実装できる。
     */
    createAvatar() {
        const avatar = new THREE.Group();
        avatar.name = "player-avatar";
        avatar.position.y = 0.52;

        const suitMaterial = new THREE.MeshStandardMaterial({
            color: 0x17232e,
            metalness: 0.58,
            roughness: 0.38
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: 0x4ddbe5,
            emissive: 0x12636b,
            emissiveIntensity: 1.35,
            metalness: 0.72,
            roughness: 0.24
        });
        const goldMaterial = new THREE.MeshStandardMaterial({
            color: 0xd8a442,
            emissive: 0x4b3108,
            emissiveIntensity: 0.7,
            metalness: 0.65,
            roughness: 0.3
        });
        const visorMaterial = new THREE.MeshStandardMaterial({
            color: 0x9bf5f7,
            emissive: 0x35cbd5,
            emissiveIntensity: 2.2,
            metalness: 0.25,
            roughness: 0.12
        });

        // 左右の脚を同じGeometryから作る。
        const legGeometry = new THREE.BoxGeometry(0.34, 1.05, 0.42);
        [-0.25, 0.25].forEach((x, index) => {
            const leg = new THREE.Mesh(legGeometry, suitMaterial);
            leg.name = index === 0 ? "avatar-leg-left" : "avatar-leg-right";
            leg.position.set(x, 0.64, 0);
            avatar.add(leg);

            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.62), goldMaterial);
            boot.name = index === 0 ? "avatar-boot-left" : "avatar-boot-right";
            boot.position.set(x, 0.14, 0.1);
            avatar.add(boot);
        });

        const hips = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.34, 0.5), suitMaterial);
        hips.position.y = 1.28;
        avatar.add(hips);

        const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.58, 0.46, 1.35, 6),
            suitMaterial
        );
        torso.position.y = 2.05;
        avatar.add(torso);

        const chestLight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), accentMaterial);
        chestLight.position.set(0, 2.16, 0.52);
        avatar.add(chestLight);

        // 腕は少し外側へ傾け、立ち姿が硬くなりすぎないようにする。
        const armGeometry = new THREE.CylinderGeometry(0.15, 0.19, 1.18, 8);
        [-1, 1].forEach(direction => {
            const arm = new THREE.Mesh(armGeometry, suitMaterial);
            arm.position.set(direction * 0.68, 1.96, 0);
            arm.rotation.z = direction * -0.13;
            avatar.add(arm);

            const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.48), accentMaterial);
            shoulder.position.set(direction * 0.61, 2.48, 0);
            avatar.add(shoulder);
        });

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.24, 8), goldMaterial);
        neck.position.y = 2.82;
        avatar.add(neck);

        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.43, 1), suitMaterial);
        head.position.y = 3.22;
        avatar.add(head);

        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.12), visorMaterial);
        visor.position.set(0, 3.25, 0.37);
        avatar.add(visor);

        // アバターを構成する全Meshに影を設定する。
        avatar.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });

        this.avatar = avatar;
        this.avatarBaseY = avatar.position.y;
        this.scene.add(avatar);
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * サーバーへ送る座標・向き・エリアを、通信量を抑えられる精度へ丸める。
     */
    getLocalPlayerState() {
        if (!this.avatar) return null;
        const y = this.isAvatarSeated ? this.avatar.position.y : this.avatarBaseY;
        return {
            area: this.currentArea,
            position: {
                x: Number(this.avatar.position.x.toFixed(3)),
                y: Number(y.toFixed(3)),
                z: Number(this.avatar.position.z.toFixed(3))
            },
            rotationY: Number(this.avatar.rotation.y.toFixed(3)),
            isMoving: Boolean(this.avatar.userData.isMoving)
        };
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * 接続中プレイヤーの一覧を反映し、一覧から消えたアバターを片付ける。
     */
    syncRemotePlayers(players = []) {
        const activePlayerIds = new Set();
        players.forEach(player => {
            if (!player?.id || player.id === this.onlineClient?.player?.id) return;
            activePlayerIds.add(player.id);
            this.updateRemotePlayer(player);
        });
        this.remotePlayers.forEach((_remotePlayer, playerId) => {
            if (!activePlayerIds.has(playerId)) this.removeRemotePlayer(playerId);
        });
        this.chatPanel.setPlayers(players);
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * 初参加なら3Dアバターを作り、既存なら補間先の座標と向きを更新する。
     */
    updateRemotePlayer(player) {
        if (!player?.id || player.id === this.onlineClient?.player?.id) return;
        let remotePlayer = this.remotePlayers.get(player.id);
        if (!remotePlayer) remotePlayer = this.createRemotePlayer(player);

        const nextArea = player.area === "shop" ? "shop" : "lobby";
        const positionX = Number(player.position?.x);
        const positionY = Number(player.position?.y);
        const positionZ = Number(player.position?.z);
        const targetPosition = new THREE.Vector3(
            Number.isFinite(positionX) ? positionX : 0,
            Number.isFinite(positionY) ? positionY : this.avatarBaseY,
            Number.isFinite(positionZ) ? positionZ : 0
        );
        if (remotePlayer.area !== nextArea) remotePlayer.container.position.copy(targetPosition);
        remotePlayer.area = nextArea;
        remotePlayer.targetPosition.copy(targetPosition);
        const rotationY = Number(player.rotationY);
        remotePlayer.targetRotationY = Number.isFinite(rotationY) ? rotationY : 0;
        remotePlayer.isMoving = Boolean(player.isMoving);
        remotePlayer.container.visible = remotePlayer.area === this.currentArea;
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * 自分と同じ形の色違いアバターと、頭上のプレイヤー名を生成する。
     */
    createRemotePlayer(player) {
        const container = new THREE.Group();
        container.name = `remote-player-${player.id}`;
        const model = this.avatar.clone(true);
        model.name = `remote-avatar-${player.id}`;
        model.position.set(0, 0, 0);
        // 複製元の現在の向きを引き継がず、受信した向きだけを親コンテナへ反映する。
        model.rotation.set(0, 0, 0);
        model.userData.isMoving = false;

        let colorHash = 0;
        for (const character of player.id) colorHash = (colorHash * 31 + character.charCodeAt(0)) >>> 0;
        const playerColor = new THREE.Color().setHSL((colorHash % 360) / 360, 0.72, 0.56);
        const ownedMaterials = [];
        model.traverse(object => {
            if (!object.isMesh || !object.material) return;
            object.material = object.material.clone();
            ownedMaterials.push(object.material);
            const originalColor = object.material.color?.getHex();
            if (originalColor === 0x4ddbe5 || originalColor === 0x9bf5f7) {
                object.material.color.copy(playerColor);
                if (object.material.emissive) object.material.emissive.copy(playerColor).multiplyScalar(0.38);
            }
        });

        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.82, 0.9, 48),
            new THREE.MeshBasicMaterial({
                color: playerColor,
                transparent: true,
                opacity: 0.72,
                side: THREE.DoubleSide
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        container.add(ring);
        ownedMaterials.push(ring.material);

        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = 512;
        labelCanvas.height = 96;
        const labelContext = labelCanvas.getContext("2d");
        labelContext.fillStyle = "rgba(4, 10, 15, 0.86)";
        labelContext.fillRect(4, 4, 504, 88);
        labelContext.strokeStyle = `#${playerColor.getHexString()}`;
        labelContext.lineWidth = 5;
        labelContext.strokeRect(4, 4, 504, 88);
        labelContext.fillStyle = "#effcff";
        labelContext.font = "700 38px Arial, sans-serif";
        labelContext.textAlign = "center";
        labelContext.textBaseline = "middle";
        labelContext.fillText(player.name || "DUELIST", 256, 50);
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthWrite: false
        }));
        label.position.set(0, 4.15, 0);
        label.scale.set(2.9, 0.54, 1);
        container.add(model, label);
        this.scene.add(container);

        const remotePlayer = {
            container,
            model,
            name: player.name || "DUELIST",
            labelTexture,
            ownedMaterials,
            targetPosition: new THREE.Vector3(),
            targetRotationY: 0,
            area: null,
            isMoving: false
        };
        this.remotePlayers.set(player.id, remotePlayer);
        return remotePlayer;
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * 受信した座標へ滑らかに追従させ、同じエリアのプレイヤーだけ表示する。
     */
    updateRemotePlayers(deltaTime) {
        const positionAlpha = 1 - Math.exp(-deltaTime * 12);
        const rotationAlpha = Math.min(1, deltaTime * 12);
        this.remotePlayers.forEach(remotePlayer => {
            remotePlayer.container.visible = remotePlayer.area === this.currentArea;
            if (!remotePlayer.container.visible) return;

            remotePlayer.container.position.lerp(remotePlayer.targetPosition, positionAlpha);
            const angleDifference = Math.atan2(
                Math.sin(remotePlayer.targetRotationY - remotePlayer.container.rotation.y),
                Math.cos(remotePlayer.targetRotationY - remotePlayer.container.rotation.y)
            );
            remotePlayer.container.rotation.y += angleDifference * rotationAlpha;
            const bobSpeed = remotePlayer.isMoving ? 8.5 : 1.8;
            const bobAmount = remotePlayer.isMoving ? 0.055 : 0.025;
            remotePlayer.model.position.y = Math.sin(this.elapsedTime * bobSpeed) * bobAmount;
        });
    }

    /**
     * ===== オンラインアバター同期の追加部分 =====
     * 切断したプレイヤーをシーンから外し、複製した描画素材を解放する。
     */
    removeRemotePlayer(playerId) {
        const remotePlayer = this.remotePlayers.get(playerId);
        if (!remotePlayer) return;
        this.scene.remove(remotePlayer.container);
        remotePlayer.ownedMaterials.forEach(material => material.dispose());
        remotePlayer.labelTexture.dispose();
        this.remotePlayers.delete(playerId);
        this.removeChatBubble(playerId);
    }

    /**
     * ===== アバター移動の追加部分 =====
     * WASDキーと矢印キーの押下状態を記録する。
     * keydownだけで動かし続けず、描画ループ側で状態を読むのがポイント。
     */
    bindMovementControls() {
        const movementKeyCodes = new Set([
            "KeyW", "KeyA", "KeyS", "KeyD",
            "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"
        ]);

        this.handleMovementKeyDown = event => {
            if (!movementKeyCodes.has(event.code)) return;
            if (!document.body.classList.contains("world-entered")) return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            event.preventDefault();
            this.pressedMovementKeys.add(event.code);
        };
        this.handleMovementKeyUp = event => {
            if (!movementKeyCodes.has(event.code)) return;
            event.preventDefault();
            this.pressedMovementKeys.delete(event.code);
        };
        this.handleWindowBlur = () => this.pressedMovementKeys.clear();

        window.addEventListener("keydown", this.handleMovementKeyDown);
        window.addEventListener("keyup", this.handleMovementKeyUp);
        window.addEventListener("blur", this.handleWindowBlur);
    }

    /**
     * ===== アバター移動の追加部分 =====
     * カメラが向いている方向を基準に、1フレーム分の移動を計算する。
     */
    updateAvatarMovement(deltaTime) {
        if (!this.avatar) return;
        if (!document.body.classList.contains("world-entered")) {
            this.avatar.userData.isMoving = false;
            return;
        }

        // ===== ショップ対戦席の追加部分 =====
        // 着席中は移動入力を無効にし、椅子の位置を保つ。
        if (this.isAvatarSeated) {
            this.avatar.userData.isMoving = false;
            return;
        }
        if (this.isPackShopOpen) {
            this.avatar.userData.isMoving = false;
            return;
        }

        const horizontalInput = Number(
            this.pressedMovementKeys.has("KeyD") || this.pressedMovementKeys.has("ArrowRight")
        ) - Number(
            this.pressedMovementKeys.has("KeyA") || this.pressedMovementKeys.has("ArrowLeft")
        );
        const forwardInput = Number(
            this.pressedMovementKeys.has("KeyW") || this.pressedMovementKeys.has("ArrowUp")
        ) - Number(
            this.pressedMovementKeys.has("KeyS") || this.pressedMovementKeys.has("ArrowDown")
        );

        if (horizontalInput === 0 && forwardInput === 0) {
            this.avatar.userData.isMoving = false;
            return;
        }

        // 上下方向を除いたカメラの正面ベクトルと、右方向ベクトルを作る。
        const cameraForward = new THREE.Vector3();
        this.camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        cameraForward.normalize();

        const cameraRight = new THREE.Vector3()
            .crossVectors(cameraForward, this.camera.up)
            .normalize();
        const moveDirection = new THREE.Vector3()
            .addScaledVector(cameraForward, forwardInput)
            .addScaledVector(cameraRight, horizontalInput)
            .normalize();

        const previousPosition = this.avatar.position.clone();
        const moveDistance = this.avatarMovementSpeed * deltaTime;
        this.avatar.position.addScaledVector(moveDirection, moveDistance);
        const movementBounds = this.getCurrentMovementBounds();
        this.avatar.position.x = THREE.MathUtils.clamp(
            this.avatar.position.x,
            movementBounds.minX,
            movementBounds.maxX
        );
        this.avatar.position.z = THREE.MathUtils.clamp(
            this.avatar.position.z,
            movementBounds.minZ,
            movementBounds.maxZ
        );

        if (this.currentArea === "lobby") {
            // ===== デュエルテーブル表示の追加部分 =====
            // 移動後に当たり判定を解決し、テーブルの中へ入らないようにする。
            this.resolveDuelTableCollision(previousPosition);

            // ===== デュエルショップ表示の追加部分 =====
            // 回転して配置されたショップの壁もすり抜けないようにする。
            this.resolveDuelShopCollision(previousPosition);
        } else if (this.currentArea === "shop") {
            // ===== ショップカウンターの追加部分 =====
            // 店内ではカウンターを通り抜けないようにする。
            this.resolveShopCounterCollision(previousPosition);

            // ===== ショップ対戦席の追加部分 =====
            // 対戦テーブルの天板へ入り込まないようにする。
            this.resolveShopDuelTableCollisions(previousPosition);

            // ===== 商品棚・カードパック購入の追加部分 =====
            // 壁際の商品棚も通り抜けないようにする。
            this.resolveShopProductShelfCollisions(previousPosition);
        }

        // アバターが進んだ分だけカメラと注視点も動かし、距離を保つ。
        const actualMovement = this.avatar.position.clone().sub(previousPosition);
        actualMovement.y = 0;
        this.camera.position.add(actualMovement);
        this.controls.target.add(actualMovement);

        // 進行方向へ滑らかに振り向かせる。
        const targetAngle = Math.atan2(moveDirection.x, moveDirection.z);
        const angleDifference = Math.atan2(
            Math.sin(targetAngle - this.avatar.rotation.y),
            Math.cos(targetAngle - this.avatar.rotation.y)
        );
        this.avatar.rotation.y += angleDifference * Math.min(1, deltaTime * 12);
        this.avatar.userData.isMoving = true;
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * 現在のエリアに合わせて、アバターが歩ける範囲を返す。
     */
    getCurrentMovementBounds() {
        if (this.currentArea === "shop" && this.shopInteriorMovementBounds) {
            return this.shopInteriorMovementBounds;
        }
        return {
            minX: -this.worldMovementLimit,
            maxX: this.worldMovementLimit,
            minZ: -this.worldMovementLimit,
            maxZ: this.worldMovementLimit
        };
    }

    /**
     * ===== デュエルテーブル表示の追加部分 =====
     * 台座・天板・カードゾーンを基本図形で組み立てる。
     */
    createDuelTable() {
        const table = new THREE.Group();
        table.name = "duel-table";
        // 縦長画面でも全体が見えやすいよう、初期カメラから見て少し左奥へ置く。
        table.position.set(-6, 0, -12);

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x161d26,
            metalness: 0.78,
            roughness: 0.28
        });
        const surfaceMaterial = new THREE.MeshStandardMaterial({
            color: 0x10262d,
            emissive: 0x082f36,
            emissiveIntensity: 0.7,
            metalness: 0.42,
            roughness: 0.32
        });
        const playerZoneMaterial = new THREE.MeshStandardMaterial({
            color: 0x267f88,
            emissive: 0x124b52,
            emissiveIntensity: 1.15,
            metalness: 0.5,
            roughness: 0.26
        });
        const opponentZoneMaterial = new THREE.MeshStandardMaterial({
            color: 0xa47727,
            emissive: 0x523708,
            emissiveIntensity: 0.9,
            metalness: 0.5,
            roughness: 0.28
        });

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(1.35, 1.75, 0.5, 8),
            frameMaterial
        );
        base.position.y = 0.25;
        table.add(base);

        const column = new THREE.Mesh(
            new THREE.CylinderGeometry(0.58, 0.82, 1.25, 8),
            frameMaterial
        );
        column.position.y = 1.05;
        table.add(column);

        const tabletop = new THREE.Mesh(
            new THREE.BoxGeometry(6.4, 0.34, 4.1),
            frameMaterial
        );
        tabletop.position.y = 1.75;
        table.add(tabletop);

        const duelSurface = new THREE.Mesh(
            new THREE.BoxGeometry(5.85, 0.09, 3.55),
            surfaceMaterial
        );
        duelSurface.position.y = 1.97;
        table.add(duelSurface);

        // 5つずつのカードゾーンを、自分側と相手側に並べる。
        const zoneGeometry = new THREE.BoxGeometry(0.82, 0.035, 1.08);
        [-1.85, -0.93, 0, 0.93, 1.85].forEach(x => {
            const playerZone = new THREE.Mesh(zoneGeometry, playerZoneMaterial);
            playerZone.position.set(x, 2.04, 0.77);
            table.add(playerZone);

            const opponentZone = new THREE.Mesh(zoneGeometry, opponentZoneMaterial);
            opponentZone.position.set(x, 2.04, -0.77);
            table.add(opponentZone);
        });

        const centerLine = new THREE.Mesh(
            new THREE.BoxGeometry(5.35, 0.04, 0.05),
            new THREE.MeshBasicMaterial({ color: 0x8ceef2 })
        );
        centerLine.position.y = 2.055;
        table.add(centerLine);

        // 接近可能な範囲を示すリング。近づいた時はanimate内で明るくする。
        const interactionRingMaterial = new THREE.MeshBasicMaterial({
            color: 0xe8b04b,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide
        });
        const interactionRing = new THREE.Mesh(
            new THREE.RingGeometry(4.3, 4.42, 80),
            interactionRingMaterial
        );
        interactionRing.rotation.x = -Math.PI / 2;
        interactionRing.position.y = 0.035;
        table.add(interactionRing);

        table.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });

        this.duelTable = table;
        this.duelTableSurfaceMaterial = surfaceMaterial;
        this.duelTableInteractionRing = interactionRing;
        this.duelTableInteractionRadius = 5.2;
        this.duelTableCollisionRadius = 3.7;
        this.scene.add(table);
    }

    /**
     * ===== デュエルテーブル表示の追加部分 =====
     * テーブルの中心へ入り込まないよう、アバターを円の外側へ戻す。
     */
    resolveDuelTableCollision(previousPosition) {
        if (!this.duelTable || !this.avatar) return;

        const offset = new THREE.Vector2(
            this.avatar.position.x - this.duelTable.position.x,
            this.avatar.position.z - this.duelTable.position.z
        );
        if (offset.length() >= this.duelTableCollisionRadius) return;

        if (offset.lengthSq() < 0.0001) {
            offset.set(
                previousPosition.x - this.duelTable.position.x,
                previousPosition.z - this.duelTable.position.z
            );
            if (offset.lengthSq() < 0.0001) offset.set(0, 1);
        }
        offset.normalize().multiplyScalar(this.duelTableCollisionRadius);
        this.avatar.position.x = this.duelTable.position.x + offset.x;
        this.avatar.position.z = this.duelTable.position.z + offset.y;
    }

    /**
     * ===== デュエルテーブル表示の追加部分 =====
     * アバターとの距離に応じて、テーブルの接近表示を切り替える。
     */
    updateDuelTableProximity() {
        if (!this.duelTable || !this.avatar) return;

        const horizontalDistance = Math.hypot(
            this.avatar.position.x - this.duelTable.position.x,
            this.avatar.position.z - this.duelTable.position.z
        );
        const isNearby = horizontalDistance <= this.duelTableInteractionRadius;
        this.duelTable.userData.isPlayerNearby = isNearby;
        this.duelTableInteractionRing.material.opacity = isNearby ? 0.9 : 0.28;
        this.duelTableSurfaceMaterial.emissiveIntensity = isNearby ? 1.55 : 0.7;
    }

    /**
     * ===== デュエルショップ表示の追加部分 =====
     * Canvasへ文字を描き、3D空間のショップ看板として使用する。
     */
    createDuelShopSignTexture() {
        const signCanvas = document.createElement("canvas");
        signCanvas.width = 1024;
        signCanvas.height = 256;
        const context = signCanvas.getContext("2d");

        context.fillStyle = "#071016";
        context.fillRect(0, 0, signCanvas.width, signCanvas.height);
        context.strokeStyle = "#f0b942";
        context.lineWidth = 18;
        context.strokeRect(16, 16, signCanvas.width - 32, signCanvas.height - 32);

        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#f4c75b";
        context.font = "700 104px Arial, sans-serif";
        context.fillText("DUEL SHOP", signCanvas.width / 2, 106);
        context.fillStyle = "#60e7ed";
        context.font = "600 32px Arial, sans-serif";
        context.fillText("CARDS  //  EQUIPMENT", signCanvas.width / 2, 190);

        const texture = new THREE.CanvasTexture(signCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        return texture;
    }

    /**
     * ===== デュエルショップ表示の追加部分 =====
     * 壁・展示窓・入口・看板を組み合わせてショップ外観を作る。
     */
    createDuelShop() {
        const shop = new THREE.Group();
        shop.name = "duel-shop";
        shop.position.set(-14, 0, -4);
        // ショップ正面（ローカルの+Z方向）を中央広場へ向ける。
        shop.rotation.y = Math.atan2(14, 4);

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x151c24,
            metalness: 0.82,
            roughness: 0.27
        });
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x26313b,
            metalness: 0.48,
            roughness: 0.52
        });
        const trimMaterial = new THREE.MeshStandardMaterial({
            color: 0xc6922d,
            emissive: 0x5f3d06,
            emissiveIntensity: 0.75,
            metalness: 0.68,
            roughness: 0.28
        });
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x15444d,
            emissive: 0x0b3037,
            emissiveIntensity: 0.95,
            transparent: true,
            opacity: 0.72,
            metalness: 0.25,
            roughness: 0.18
        });
        const portalMaterial = new THREE.MeshStandardMaterial({
            color: 0x4bdde5,
            emissive: 0x13a8b4,
            emissiveIntensity: 1.05,
            transparent: true,
            opacity: 0.48,
            metalness: 0.2,
            roughness: 0.18
        });

        const addBox = (size, position, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
            mesh.position.set(...position);
            shop.add(mesh);
            return mesh;
        };

        addBox([9.8, 0.35, 6.8], [0, 0.18, 0], frameMaterial);
        addBox([9, 5, 0.35], [0, 2.7, -2.8], wallMaterial);
        addBox([0.35, 5, 5.6], [-4.32, 2.7, 0], wallMaterial);
        addBox([0.35, 5, 5.6], [4.32, 2.7, 0], wallMaterial);
        addBox([3.45, 4.2, 0.35], [-2.78, 2.3, 2.8], wallMaterial);
        addBox([3.45, 4.2, 0.35], [2.78, 2.3, 2.8], wallMaterial);
        addBox([9, 1.05, 0.35], [0, 4.72, 2.8], wallMaterial);
        addBox([10.1, 0.42, 6.9], [0, 5.38, 0], frameMaterial);

        // 左右の展示窓には、カードを模したプレートを3枚ずつ並べる。
        [-2.75, 2.75].forEach((windowX, sideIndex) => {
            addBox([2.65, 2.25, 0.09], [windowX, 2.45, 3.01], glassMaterial);
            [-0.72, 0, 0.72].forEach((offsetX, cardIndex) => {
                const cardMaterial = new THREE.MeshStandardMaterial({
                    color: sideIndex === 0 ? 0x2b8f98 : 0xb87b25,
                    emissive: sideIndex === 0 ? 0x104d55 : 0x5a3508,
                    emissiveIntensity: 1.15,
                    metalness: 0.4,
                    roughness: 0.3
                });
                const card = addBox(
                    [0.52, 0.78, 0.06],
                    [windowX + offsetX, 2.45 + (cardIndex % 2) * 0.14, 3.09],
                    cardMaterial
                );
                card.rotation.z = (cardIndex - 1) * 0.08;
            });
        });

        // 将来の入店操作に使う入口。接近時は発光が強くなる。
        const portal = addBox([1.82, 3.35, 0.1], [0, 1.92, 3.03], portalMaterial);
        addBox([0.16, 3.7, 0.28], [-1.05, 1.95, 2.92], trimMaterial);
        addBox([0.16, 3.7, 0.28], [1.05, 1.95, 2.92], trimMaterial);
        addBox([2.26, 0.16, 0.28], [0, 3.82, 2.92], trimMaterial);

        const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(5.7, 1.42),
            new THREE.MeshBasicMaterial({ map: this.createDuelShopSignTexture() })
        );
        sign.position.set(0, 6.2, 2.94);
        shop.add(sign);

        // 入口前のリングは、ショップへ近づく目印として使用する。
        const entranceRing = new THREE.Mesh(
            new THREE.RingGeometry(2.05, 2.18, 64),
            new THREE.MeshBasicMaterial({
                color: 0x55e7ed,
                transparent: true,
                opacity: 0.24,
                side: THREE.DoubleSide
            })
        );
        entranceRing.rotation.x = -Math.PI / 2;
        entranceRing.position.set(0, 0.04, 5.05);
        shop.add(entranceRing);

        [3.9, 5.05, 6.2].forEach((z, index) => {
            const pathLight = addBox(
                [2.3 + index * 0.42, 0.035, 0.18],
                [0, 0.055, z],
                trimMaterial
            );
            pathLight.receiveShadow = false;
        });

        const entranceLight = new THREE.PointLight(0x45dbe4, 18, 11, 2);
        entranceLight.position.set(0, 3.1, 4.25);
        shop.add(entranceLight);

        const entranceAnchor = new THREE.Object3D();
        entranceAnchor.position.set(0, 0, 5.05);
        shop.add(entranceAnchor);

        shop.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        sign.castShadow = false;
        entranceRing.castShadow = false;

        this.duelShop = shop;
        this.duelShopPortal = portal;
        this.duelShopEntranceRing = entranceRing;
        this.duelShopEntranceLight = entranceLight;
        this.duelShopEntranceAnchor = entranceAnchor;
        this.duelShopInteractionRadius = 4.2;
        this.duelShopCollisionHalfWidth = 4.85;
        this.duelShopCollisionHalfDepth = 3.65;
        this.scene.add(shop);
    }

    /**
     * ===== デュエルショップ表示の追加部分 =====
     * ショップ座標へ変換してから矩形の当たり判定を行う。
     */
    resolveDuelShopCollision(previousPosition) {
        if (!this.duelShop || !this.avatar) return;

        this.duelShop.updateWorldMatrix(true, false);
        const localPosition = this.duelShop.worldToLocal(this.avatar.position.clone());
        const halfWidth = this.duelShopCollisionHalfWidth;
        const halfDepth = this.duelShopCollisionHalfDepth;
        if (Math.abs(localPosition.x) >= halfWidth || Math.abs(localPosition.z) >= halfDepth) return;

        const previousLocal = this.duelShop.worldToLocal(previousPosition.clone());
        if (previousLocal.x <= -halfWidth) localPosition.x = -halfWidth;
        else if (previousLocal.x >= halfWidth) localPosition.x = halfWidth;
        else if (previousLocal.z <= -halfDepth) localPosition.z = -halfDepth;
        else if (previousLocal.z >= halfDepth) localPosition.z = halfDepth;
        else {
            const xDistance = halfWidth - Math.abs(localPosition.x);
            const zDistance = halfDepth - Math.abs(localPosition.z);
            if (xDistance < zDistance) localPosition.x = Math.sign(localPosition.x || 1) * halfWidth;
            else localPosition.z = Math.sign(localPosition.z || 1) * halfDepth;
        }

        const correctedWorldPosition = this.duelShop.localToWorld(localPosition);
        this.avatar.position.x = correctedWorldPosition.x;
        this.avatar.position.z = correctedWorldPosition.z;
    }

    /**
     * ===== デュエルショップ表示の追加部分 =====
     * 入口へ近づいた時に、看板代わりの入口演出を明るくする。
     */
    updateDuelShopProximity() {
        if (!this.duelShop || !this.avatar) return;

        const entrancePosition = new THREE.Vector3();
        this.duelShopEntranceAnchor.getWorldPosition(entrancePosition);
        const distance = Math.hypot(
            this.avatar.position.x - entrancePosition.x,
            this.avatar.position.z - entrancePosition.z
        );
        const isNearby = distance <= this.duelShopInteractionRadius;
        this.duelShop.userData.isPlayerNearby = isNearby;
        this.duelShopEntranceRing.material.opacity = isNearby ? 0.9 : 0.24;
        this.duelShopPortal.material.emissiveIntensity = isNearby ? 2.1 : 1.05;
        this.duelShopPortal.material.opacity = isNearby ? 0.72 : 0.48;
        this.duelShopEntranceLight.intensity = isNearby ? 38 : 18;
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * カウンターや座席を後から置ける、独立した店内空間を作る。
     */
    createShopInterior() {
        const interior = new THREE.Group();
        interior.name = "shop-interior";
        interior.position.set(0, 0, 60);

        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x17242b,
            metalness: 0.3,
            roughness: 0.72
        });
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x24323a,
            metalness: 0.38,
            roughness: 0.58
        });
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x11171d,
            metalness: 0.82,
            roughness: 0.28
        });
        const goldMaterial = new THREE.MeshStandardMaterial({
            color: 0xc9912e,
            emissive: 0x5b3805,
            emissiveIntensity: 0.78,
            metalness: 0.7,
            roughness: 0.3
        });
        const exitMaterial = new THREE.MeshStandardMaterial({
            color: 0x50e1e8,
            emissive: 0x159ca7,
            emissiveIntensity: 1.05,
            transparent: true,
            opacity: 0.5,
            metalness: 0.2,
            roughness: 0.18
        });

        const addInteriorBox = (size, position, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
            mesh.position.set(...position);
            interior.add(mesh);
            return mesh;
        };

        // ===== ショップ店内拡張の追加部分 =====
        // 左を販売エリア、右を対戦エリアに分けられる広さへ拡張する。
        addInteriorBox([24, 0.28, 20], [0, 0.14, 0], floorMaterial);
        addInteriorBox([24, 5.2, 0.35], [0, 2.74, -9.8], wallMaterial);
        addInteriorBox([0.35, 5.2, 20], [-11.82, 2.74, 0], wallMaterial);
        addInteriorBox([0.35, 5.2, 20], [11.82, 2.74, 0], wallMaterial);
        addInteriorBox([10.5, 5.2, 0.35], [-6.75, 2.74, 9.8], wallMaterial);
        addInteriorBox([10.5, 5.2, 0.35], [6.75, 2.74, 9.8], wallMaterial);
        addInteriorBox([2.35, 1.15, 0.35], [0, 4.77, 9.8], wallMaterial);

        // 壁際の発光ラインで、店内フィールドの奥行きを分かりやすくする。
        addInteriorBox([22.8, 0.12, 0.12], [0, 3.85, -9.58], goldMaterial);
        addInteriorBox([0.12, 0.12, 18.8], [-11.58, 3.85, 0], goldMaterial);
        addInteriorBox([0.12, 0.12, 18.8], [11.58, 3.85, 0], goldMaterial);

        // 左右の用途を床面でも読み取れるよう、中央に区画ラインを通す。
        addInteriorBox([0.08, 0.035, 17.4], [0, 0.31, -0.35], goldMaterial);

        const floorGrid = new THREE.GridHelper(19.4, 20, 0x48d8df, 0x31505b);
        floorGrid.scale.x = 1.2;
        floorGrid.position.y = 0.295;
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = 0.32;
        interior.add(floorGrid);

        // ===== ショップカウンターの追加部分 =====
        // 店内左奥に、カード展示ケース・レジ・店員をまとめて配置する。
        this.createShopCounter(interior);

        // ===== ショップ対戦席の追加部分 =====
        // 店内右側に対戦テーブルと、実際に座れる椅子を配置する。
        this.createShopDuelArea(interior);

        // ===== 商品棚・カードパック購入の追加部分 =====
        // 販売エリア側の壁際に、商品棚をまとめて配置する。
        this.createShopProductShelves(interior);

        // 店内側の出口。外の入口と同じく、近づくと明るくなる。
        const exitPortal = addInteriorBox([2.05, 3.5, 0.1], [0, 1.94, 9.58], exitMaterial);
        addInteriorBox([0.17, 3.85, 0.32], [-1.18, 2.02, 9.48], goldMaterial);
        addInteriorBox([0.17, 3.85, 0.32], [1.18, 2.02, 9.48], goldMaterial);
        addInteriorBox([2.52, 0.17, 0.32], [0, 4.02, 9.48], goldMaterial);

        const exitSignCanvas = document.createElement("canvas");
        exitSignCanvas.width = 512;
        exitSignCanvas.height = 160;
        const exitContext = exitSignCanvas.getContext("2d");
        exitContext.fillStyle = "#071016";
        exitContext.fillRect(0, 0, 512, 160);
        exitContext.strokeStyle = "#55e7ed";
        exitContext.lineWidth = 12;
        exitContext.strokeRect(10, 10, 492, 140);
        exitContext.fillStyle = "#d8fbff";
        exitContext.textAlign = "center";
        exitContext.textBaseline = "middle";
        exitContext.font = "700 78px Arial, sans-serif";
        exitContext.fillText("EXIT", 256, 84);
        const exitTexture = new THREE.CanvasTexture(exitSignCanvas);
        exitTexture.colorSpace = THREE.SRGBColorSpace;
        const exitSign = new THREE.Mesh(
            new THREE.PlaneGeometry(2.5, 0.78),
            new THREE.MeshBasicMaterial({ map: exitTexture })
        );
        // 店内から見えるよう、+Z側の壁より少し手前（-Z側）へ向けて置く。
        exitSign.position.set(0, 4.72, 9.57);
        exitSign.rotation.y = Math.PI;
        interior.add(exitSign);

        const exitRing = new THREE.Mesh(
            new THREE.RingGeometry(1.7, 1.84, 64),
            new THREE.MeshBasicMaterial({
                color: 0x55e7ed,
                transparent: true,
                opacity: 0.25,
                side: THREE.DoubleSide
            })
        );
        exitRing.rotation.x = -Math.PI / 2;
        exitRing.position.set(0, 0.32, 7.45);
        interior.add(exitRing);

        const exitAnchor = new THREE.Object3D();
        exitAnchor.position.set(0, 0, 7.45);
        interior.add(exitAnchor);

        const spawnAnchor = new THREE.Object3D();
        spawnAnchor.position.set(0, this.avatarBaseY, 6.5);
        interior.add(spawnAnchor);

        const cyanLight = new THREE.PointLight(0x4de5ec, 34, 19, 2);
        cyanLight.position.set(2.8, 4.6, 4.8);
        interior.add(cyanLight);
        const warmLight = new THREE.PointLight(0xf0b94c, 28, 18, 2);
        warmLight.position.set(-5.4, 4.2, -5.8);
        interior.add(warmLight);

        interior.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        floorGrid.castShadow = false;
        exitRing.castShadow = false;
        exitSign.castShadow = false;

        this.shopInterior = interior;
        this.shopInteriorExitPortal = exitPortal;
        this.shopInteriorExitRing = exitRing;
        this.shopInteriorExitAnchor = exitAnchor;
        this.shopInteriorSpawnAnchor = spawnAnchor;
        this.shopInteriorExitLight = cyanLight;
        this.shopInteriorInteractionRadius = 2.7;
        this.shopInteriorMovementBounds = {
            minX: -11.25,
            maxX: 11.25,
            minZ: interior.position.z - 9.15,
            maxZ: interior.position.z + 8.5
        };
        interior.visible = false;
        this.scene.add(interior);
    }

    /**
     * ===== ショップカウンターの追加部分 =====
     * カード展示ケース、レジ端末、店員NPCをひとつのグループにまとめる。
     */
    createShopCounter(interior) {
        const counter = new THREE.Group();
        counter.name = "shop-counter";
        counter.position.set(-5.4, 0.3, -6.15);

        const counterMaterial = new THREE.MeshStandardMaterial({
            color: 0x18242c,
            metalness: 0.68,
            roughness: 0.36
        });
        const topMaterial = new THREE.MeshStandardMaterial({
            color: 0x263942,
            metalness: 0.78,
            roughness: 0.24
        });
        const goldMaterial = new THREE.MeshStandardMaterial({
            color: 0xd39a31,
            emissive: 0x654006,
            emissiveIntensity: 0.82,
            metalness: 0.65,
            roughness: 0.3
        });
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x6de8ed,
            emissive: 0x123e45,
            emissiveIntensity: 0.72,
            transparent: true,
            opacity: 0.32,
            metalness: 0.15,
            roughness: 0.08
        });
        const screenMaterial = new THREE.MeshStandardMaterial({
            color: 0x77f5f2,
            emissive: 0x29c9ce,
            emissiveIntensity: 1.8,
            metalness: 0.18,
            roughness: 0.2
        });

        const addCounterBox = (size, position, material, parent = counter) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
            mesh.position.set(...position);
            parent.add(mesh);
            return mesh;
        };

        addCounterBox([7.8, 1.22, 1.45], [0, 0.72, 0], counterMaterial);
        addCounterBox([8.1, 0.18, 1.7], [0, 1.39, 0], topMaterial);
        addCounterBox([7.25, 0.16, 0.06], [0, 0.86, 0.76], goldMaterial);
        addCounterBox([4.6, 0.68, 1.18], [-1.25, 1.78, 0.05], glassMaterial);

        // ガラスケース内に、色の異なるカードパックを並べる。
        const packColors = [0x29aab3, 0xcf9130, 0x8c5eb8, 0x3aa36e, 0xb94a58];
        [-2.75, -2, -1.25, -0.5, 0.25].forEach((x, index) => {
            const packMaterial = new THREE.MeshStandardMaterial({
                color: packColors[index],
                emissive: packColors[index],
                emissiveIntensity: 0.2,
                metalness: 0.42,
                roughness: 0.34
            });
            const pack = addCounterBox([0.48, 0.72, 0.08], [x, 1.75, 0.68], packMaterial);
            pack.rotation.z = (index - 2) * 0.045;
        });

        // 右側にはレジ台と発光ディスプレイを置く。
        addCounterBox([1.15, 0.24, 0.78], [2.72, 1.62, -0.05], counterMaterial);
        const registerScreen = addCounterBox([0.92, 0.72, 0.12], [2.72, 2.05, 0.14], screenMaterial);
        registerScreen.rotation.x = -0.16;

        const shopkeeper = new THREE.Group();
        shopkeeper.name = "shopkeeper";
        shopkeeper.position.set(2.25, 0, -1.25);
        const uniformMaterial = new THREE.MeshStandardMaterial({
            color: 0x12343c,
            emissive: 0x08242a,
            emissiveIntensity: 0.5,
            metalness: 0.38,
            roughness: 0.45
        });
        const skinMaterial = new THREE.MeshStandardMaterial({
            color: 0xd3a06b,
            roughness: 0.72
        });
        const shopkeeperVisorMaterial = screenMaterial.clone();
        addCounterBox([0.9, 1.35, 0.5], [0, 1.55, 0], uniformMaterial, shopkeeper);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), skinMaterial);
        head.position.set(0, 2.55, 0);
        shopkeeper.add(head);
        addCounterBox([0.52, 0.16, 0.12], [0, 2.58, 0.38], shopkeeperVisorMaterial, shopkeeper);
        addCounterBox([0.22, 1.15, 0.22], [-0.58, 1.5, 0], uniformMaterial, shopkeeper);
        addCounterBox([0.22, 1.15, 0.22], [0.58, 1.5, 0], uniformMaterial, shopkeeper);
        addCounterBox([0.3, 0.75, 0.3], [-0.24, 0.52, 0], counterMaterial, shopkeeper);
        addCounterBox([0.3, 0.75, 0.3], [0.24, 0.52, 0], counterMaterial, shopkeeper);
        counter.add(shopkeeper);

        // カウンター前の接客位置。ここへ近づいた時だけ店員と会話できる。
        const shopkeeperInteractionAnchor = new THREE.Object3D();
        shopkeeperInteractionAnchor.position.set(2.25, 0, 1.55);
        counter.add(shopkeeperInteractionAnchor);

        const shopkeeperInteractionRing = new THREE.Mesh(
            new THREE.RingGeometry(0.62, 0.72, 48),
            new THREE.MeshBasicMaterial({
                color: 0x5ce7ed,
                transparent: true,
                opacity: 0.18,
                side: THREE.DoubleSide
            })
        );
        shopkeeperInteractionRing.rotation.x = -Math.PI / 2;
        shopkeeperInteractionRing.position.set(2.25, 0.02, 1.55);
        counter.add(shopkeeperInteractionRing);

        this.shopkeeperClickTargets = [];
        const shopkeeperData = { shopkeeper };
        shopkeeper.traverse(object => {
            if (!object.isMesh) return;
            object.userData.shopkeeper = shopkeeperData;
            this.shopkeeperClickTargets.push(object);
        });

        // 奥の壁にカウンターの場所を示すサインを置く。
        const signCanvas = document.createElement("canvas");
        signCanvas.width = 768;
        signCanvas.height = 180;
        const signContext = signCanvas.getContext("2d");
        signContext.fillStyle = "#071016";
        signContext.fillRect(0, 0, 768, 180);
        signContext.strokeStyle = "#e8b04b";
        signContext.lineWidth = 12;
        signContext.strokeRect(10, 10, 748, 160);
        signContext.fillStyle = "#f4ce78";
        signContext.textAlign = "center";
        signContext.textBaseline = "middle";
        signContext.font = "700 70px Arial, sans-serif";
        signContext.fillText("CARD COUNTER", 384, 92);
        const signTexture = new THREE.CanvasTexture(signCanvas);
        signTexture.colorSpace = THREE.SRGBColorSpace;
        const counterSign = new THREE.Mesh(
            new THREE.PlaneGeometry(4.9, 1.15),
            new THREE.MeshBasicMaterial({ map: signTexture })
        );
        counterSign.position.set(-5.4, 4.55, -9.59);
        interior.add(counterSign);

        counter.traverse(object => {
            if (!object.isMesh) return;
            object.castShadow = true;
            object.receiveShadow = true;
        });
        counterSign.castShadow = false;

        this.shopCounter = counter;
        this.shopkeeper = shopkeeper;
        this.shopkeeperUniformMaterial = uniformMaterial;
        this.shopkeeperVisorMaterial = shopkeeperVisorMaterial;
        this.shopkeeperInteractionAnchor = shopkeeperInteractionAnchor;
        this.shopkeeperInteractionRing = shopkeeperInteractionRing;
        this.shopkeeperInteractionRadius = 1.55;
        this.isNearShopkeeper = false;
        this.shopCounterCollisionHalfWidth = 4.35;
        this.shopCounterCollisionHalfDepth = 1.18;
        interior.add(counter);
    }

    /**
     * ===== ショップカウンターの追加部分 =====
     * カウンターのローカル座標で矩形判定し、アバターを手前へ押し戻す。
     */
    resolveShopCounterCollision(previousPosition) {
        if (!this.shopCounter || !this.avatar) return;

        this.shopCounter.updateWorldMatrix(true, false);
        const localPosition = this.shopCounter.worldToLocal(this.avatar.position.clone());
        const halfWidth = this.shopCounterCollisionHalfWidth;
        const halfDepth = this.shopCounterCollisionHalfDepth;
        if (Math.abs(localPosition.x) >= halfWidth || Math.abs(localPosition.z) >= halfDepth) return;

        const previousLocal = this.shopCounter.worldToLocal(previousPosition.clone());
        if (previousLocal.x <= -halfWidth) localPosition.x = -halfWidth;
        else if (previousLocal.x >= halfWidth) localPosition.x = halfWidth;
        else if (previousLocal.z <= -halfDepth) localPosition.z = -halfDepth;
        else if (previousLocal.z >= halfDepth) localPosition.z = halfDepth;
        else {
            const xDistance = halfWidth - Math.abs(localPosition.x);
            const zDistance = halfDepth - Math.abs(localPosition.z);
            if (xDistance < zDistance) localPosition.x = Math.sign(localPosition.x || 1) * halfWidth;
            else localPosition.z = Math.sign(localPosition.z || 1) * halfDepth;
        }

        const correctedPosition = this.shopCounter.localToWorld(localPosition);
        this.avatar.position.x = correctedPosition.x;
        this.avatar.position.z = correctedPosition.z;
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * 右側のデュエルスペースへ、2台のテーブルと向かい合う4脚の椅子を作る。
     */
    createShopDuelArea(interior) {
        this.shopDuelTables = [];
        this.shopSeats = [];
        this.shopSeatClickTargets = [];

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x131b23,
            metalness: 0.8,
            roughness: 0.3
        });
        const surfaceMaterial = new THREE.MeshStandardMaterial({
            color: 0x17343b,
            emissive: 0x0a2930,
            emissiveIntensity: 0.7,
            metalness: 0.45,
            roughness: 0.32
        });
        const cyanZoneMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a9ba4,
            emissive: 0x15545c,
            emissiveIntensity: 0.95,
            metalness: 0.45,
            roughness: 0.28
        });
        const goldZoneMaterial = new THREE.MeshStandardMaterial({
            color: 0xb67f28,
            emissive: 0x593806,
            emissiveIntensity: 0.8,
            metalness: 0.45,
            roughness: 0.3
        });

        [
            { x: 5.5, z: -3.25 },
            { x: 5.5, z: 3.15 }
        ].forEach((tableConfig, tableIndex) => {
            const { x: tableX, z: tableZ } = tableConfig;
            const table = new THREE.Group();
            table.name = `shop-duel-table-${tableIndex + 1}`;
            table.position.set(tableX, 0.3, tableZ);

            const base = new THREE.Mesh(
                new THREE.CylinderGeometry(0.72, 0.95, 0.38, 8),
                frameMaterial
            );
            base.position.y = 0.2;
            table.add(base);

            const column = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.44, 1.08, 8),
                frameMaterial
            );
            column.position.y = 0.88;
            table.add(column);

            const tabletop = new THREE.Mesh(
                new THREE.BoxGeometry(3.2, 0.2, 2.05),
                surfaceMaterial
            );
            tabletop.position.y = 1.48;
            table.add(tabletop);

            [-0.92, 0, 0.92].forEach(x => {
                const playerZone = new THREE.Mesh(
                    new THREE.BoxGeometry(0.72, 0.035, 0.62),
                    cyanZoneMaterial
                );
                playerZone.position.set(x, 1.6, 0.48);
                table.add(playerZone);

                const opponentZone = new THREE.Mesh(
                    new THREE.BoxGeometry(0.72, 0.035, 0.62),
                    goldZoneMaterial
                );
                opponentZone.position.set(x, 1.6, -0.48);
                table.add(opponentZone);
            });

            const centerLine = new THREE.Mesh(
                new THREE.BoxGeometry(2.85, 0.04, 0.05),
                new THREE.MeshBasicMaterial({ color: 0xd8f8fa })
            );
            centerLine.position.y = 1.62;
            table.add(centerLine);
            interior.add(table);
            this.shopDuelTables.push(table);

            [
                { z: 2.05, rotationY: Math.PI },
                { z: -2.05, rotationY: 0 }
            ].forEach((seatConfig, seatIndex) => {
                const chair = new THREE.Group();
                chair.name = `shop-seat-${tableIndex + 1}-${seatIndex + 1}`;
                chair.position.set(tableX, 0.3, tableZ + seatConfig.z);
                chair.rotation.y = seatConfig.rotationY;

                const chairMaterial = new THREE.MeshStandardMaterial({
                    color: 0x24404a,
                    emissive: 0x0b252b,
                    emissiveIntensity: 0.45,
                    metalness: 0.62,
                    roughness: 0.36
                });
                const seat = new THREE.Mesh(
                    new THREE.BoxGeometry(0.92, 0.18, 0.88),
                    chairMaterial
                );
                seat.position.y = 0.86;
                chair.add(seat);

                const backrest = new THREE.Mesh(
                    new THREE.BoxGeometry(0.92, 1.05, 0.18),
                    chairMaterial
                );
                backrest.position.set(0, 1.35, -0.4);
                chair.add(backrest);

                [-0.34, 0.34].forEach(x => {
                    const leg = new THREE.Mesh(
                        new THREE.BoxGeometry(0.13, 0.82, 0.13),
                        frameMaterial
                    );
                    leg.position.set(x, 0.42, 0);
                    chair.add(leg);
                });

                const seatAnchor = new THREE.Object3D();
                seatAnchor.position.set(0, 0.16, 0.04);
                chair.add(seatAnchor);

                const seatData = {
                    chair,
                    anchor: seatAnchor,
                    material: chairMaterial,
                    rotationY: seatConfig.rotationY,
                    occupied: false
                };
                chair.traverse(object => {
                    if (!object.isMesh) return;
                    object.castShadow = true;
                    object.receiveShadow = true;
                    object.userData.shopSeat = seatData;
                    this.shopSeatClickTargets.push(object);
                });
                interior.add(chair);
                this.shopSeats.push(seatData);
            });

            table.traverse(object => {
                if (!object.isMesh) return;
                object.castShadow = true;
                object.receiveShadow = true;
            });
        });

        // ===== ショップ店内拡張の追加部分 =====
        // 奥の壁に右側が対戦エリアだと分かるサインを表示する。
        const signCanvas = document.createElement("canvas");
        signCanvas.width = 768;
        signCanvas.height = 180;
        const signContext = signCanvas.getContext("2d");
        signContext.fillStyle = "#071016";
        signContext.fillRect(0, 0, 768, 180);
        signContext.strokeStyle = "#55e7ed";
        signContext.lineWidth = 12;
        signContext.strokeRect(10, 10, 748, 160);
        signContext.fillStyle = "#d8fbff";
        signContext.textAlign = "center";
        signContext.textBaseline = "middle";
        signContext.font = "700 70px Arial, sans-serif";
        signContext.fillText("DUEL SPACE", 384, 92);
        const signTexture = new THREE.CanvasTexture(signCanvas);
        signTexture.colorSpace = THREE.SRGBColorSpace;
        const duelAreaSign = new THREE.Mesh(
            new THREE.PlaneGeometry(4.9, 1.15),
            new THREE.MeshBasicMaterial({ map: signTexture })
        );
        duelAreaSign.position.set(5.5, 4.55, -9.59);
        interior.add(duelAreaSign);

        this.shopDuelTableCollisionRadius = 1.72;
        this.shopSeatInteractionRadius = 1.55;
        this.isAvatarSeated = false;
        this.activeShopSeat = null;
        this.nearestShopSeat = null;
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * 各デュエルテーブルを円として扱い、中心へ入ったアバターを外へ戻す。
     */
    resolveShopDuelTableCollisions(previousPosition) {
        if (!this.shopDuelTables || !this.avatar) return;

        this.shopDuelTables.forEach(table => {
            const tablePosition = new THREE.Vector3();
            table.getWorldPosition(tablePosition);
            const offset = new THREE.Vector2(
                this.avatar.position.x - tablePosition.x,
                this.avatar.position.z - tablePosition.z
            );
            if (offset.length() >= this.shopDuelTableCollisionRadius) return;

            if (offset.lengthSq() < 0.0001) {
                offset.set(
                    previousPosition.x - tablePosition.x,
                    previousPosition.z - tablePosition.z
                );
                if (offset.lengthSq() < 0.0001) offset.set(0, 1);
            }
            offset.normalize().multiplyScalar(this.shopDuelTableCollisionRadius);
            this.avatar.position.x = tablePosition.x + offset.x;
            this.avatar.position.z = tablePosition.z + offset.y;
        });
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 左側の販売エリアに商品棚を置き、色違いのカードパックを陳列する。
     */
    createShopProductShelves(interior) {
        this.shopProductShelves = [];

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x141d25,
            metalness: 0.82,
            roughness: 0.3
        });
        const shelfMaterial = new THREE.MeshStandardMaterial({
            color: 0x293943,
            metalness: 0.62,
            roughness: 0.38
        });
        const packColors = [0x28afb7, 0xd29a30, 0x9c67c2];

        [
            { x: -11.32, z: 0, rotationY: Math.PI / 2 },
            { x: -11.32, z: 4.35, rotationY: Math.PI / 2 }
        ].forEach((config, shelfIndex) => {
            const shelf = new THREE.Group();
            shelf.name = `shop-product-shelf-${shelfIndex + 1}`;
            shelf.position.set(config.x, 0.3, config.z);
            shelf.rotation.y = config.rotationY;

            const back = new THREE.Mesh(
                new THREE.BoxGeometry(3.5, 3.35, 0.28),
                frameMaterial
            );
            back.position.y = 1.75;
            shelf.add(back);

            const highlightMaterial = new THREE.MeshStandardMaterial({
                color: 0x4ddde5,
                emissive: 0x12636b,
                emissiveIntensity: 0.48,
                metalness: 0.65,
                roughness: 0.26
            });
            const highlight = new THREE.Mesh(
                new THREE.BoxGeometry(3.3, 0.1, 0.12),
                highlightMaterial
            );
            highlight.position.set(0, 3.36, 0.24);
            shelf.add(highlight);

            [0.75, 1.72, 2.69].forEach((y, rowIndex) => {
                const board = new THREE.Mesh(
                    new THREE.BoxGeometry(3.45, 0.14, 0.76),
                    shelfMaterial
                );
                board.position.set(0, y, 0.35);
                shelf.add(board);

                [-1.15, -0.58, 0, 0.58, 1.15].forEach((x, packIndex) => {
                    const color = packColors[(rowIndex + packIndex + shelfIndex) % packColors.length];
                    const packMaterial = new THREE.MeshStandardMaterial({
                        color,
                        emissive: color,
                        emissiveIntensity: 0.25,
                        metalness: 0.4,
                        roughness: 0.32
                    });
                    const pack = new THREE.Mesh(
                        new THREE.BoxGeometry(0.38, 0.66, 0.08),
                        packMaterial
                    );
                    pack.position.set(x, y + 0.43, 0.76);
                    pack.rotation.z = (packIndex - 2) * 0.035;
                    shelf.add(pack);
                });
            });

            const shelfData = { shelf };
            shelf.traverse(object => {
                if (!object.isMesh) return;
                object.castShadow = true;
                object.receiveShadow = true;
            });
            interior.add(shelf);
            this.shopProductShelves.push(shelfData);
        });

        this.shopProductShelfCollisionHalfWidth = 1.92;
        // 棚の最前面にアバター半径を加え、見た目より手前で停止させる。
        this.shopProductShelfCollisionHalfDepth = 1.5;
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 回転した各商品棚の座標へ変換し、矩形の当たり判定を行う。
     */
    resolveShopProductShelfCollisions(previousPosition) {
        if (!this.shopProductShelves?.length || !this.avatar) return;

        this.shopProductShelves.forEach(({ shelf }) => {
            shelf.updateWorldMatrix(true, false);
            const localPosition = shelf.worldToLocal(this.avatar.position.clone());
            const halfWidth = this.shopProductShelfCollisionHalfWidth;
            const halfDepth = this.shopProductShelfCollisionHalfDepth;
            if (Math.abs(localPosition.x) >= halfWidth || Math.abs(localPosition.z) >= halfDepth) return;

            const previousLocal = shelf.worldToLocal(previousPosition.clone());
            if (previousLocal.x <= -halfWidth) localPosition.x = -halfWidth;
            else if (previousLocal.x >= halfWidth) localPosition.x = halfWidth;
            else if (previousLocal.z <= -halfDepth) localPosition.z = -halfDepth;
            else if (previousLocal.z >= halfDepth) localPosition.z = halfDepth;
            else {
                const xDistance = halfWidth - Math.abs(localPosition.x);
                const zDistance = halfDepth - Math.abs(localPosition.z);
                if (xDistance < zDistance) localPosition.x = Math.sign(localPosition.x || 1) * halfWidth;
                else localPosition.z = Math.sign(localPosition.z || 1) * halfDepth;
            }

            const correctedPosition = shelf.localToWorld(localPosition);
            this.avatar.position.x = correctedPosition.x;
            this.avatar.position.z = correctedPosition.z;
        });
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * エリア移動時にロビーの床や建物だけをまとめて表示・非表示にする。
     */
    setLobbyEnvironmentVisible(isVisible) {
        this.lobbyEnvironmentObjects.forEach(object => {
            object.visible = isVisible;
        });
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * 入口のクリックとEキーを監視し、ロビーと店内を往復できるようにする。
     */
    bindWorldInteractions() {
        this.portalRaycaster = new THREE.Raycaster();
        this.portalPointer = new THREE.Vector2();
        this.pointerDownPosition = null;

        this.handleWorldInteractionKeyDown = event => {
            if (event.repeat) return;
            if (this.isPackShopOpen) {
                if (event.code === "Escape" || event.code === "KeyE") this.closePackShop();
                return;
            }
            if (event.code !== "KeyE") return;
            if (this.isAvatarSeated) {
                this.standFromShopSeat();
            } else if (this.currentArea === "lobby" && this.duelShop.userData.isPlayerNearby) {
                this.enterShopInterior();
            } else if (this.currentArea === "shop" && this.nearestShopSeat) {
                this.sitOnShopSeat(this.nearestShopSeat);
            } else if (this.currentArea === "shop" && this.isNearShopkeeper) {
                this.startShopkeeperConversation();
            } else if (this.currentArea === "shop" && this.shopInterior.userData.isPlayerNearExit) {
                this.leaveShopInterior();
            }
        };
        this.handlePortalPointerDown = event => {
            this.pointerDownPosition = { x: event.clientX, y: event.clientY };
        };
        this.handlePortalPointerUp = event => {
            if (!this.pointerDownPosition) return;
            const movement = Math.hypot(
                event.clientX - this.pointerDownPosition.x,
                event.clientY - this.pointerDownPosition.y
            );
            this.pointerDownPosition = null;
            if (movement > 7) return;

            const portal = this.getPortalAtPointer(event);
            if (portal === this.duelShopPortal && this.duelShop.userData.isPlayerNearby) {
                this.enterShopInterior();
            } else if (
                portal === this.shopInteriorExitPortal &&
                this.shopInterior.userData.isPlayerNearExit
            ) {
                this.leaveShopInterior();
            } else if (this.currentArea === "shop" && !this.isAvatarSeated) {
                const seat = this.getShopSeatAtPointer(event);
                if (seat && seat === this.nearestShopSeat) {
                    this.sitOnShopSeat(seat);
                    return;
                }
                const shopkeeper = this.getShopkeeperAtPointer(event);
                if (shopkeeper && this.isNearShopkeeper) this.startShopkeeperConversation();
            }
        };
        this.handlePortalPointerMove = event => {
            const portal = this.getPortalAtPointer(event);
            const seat = this.currentArea === "shop" && !this.isAvatarSeated
                ? this.getShopSeatAtPointer(event)
                : null;
            const shopkeeper = this.currentArea === "shop" && !this.isAvatarSeated
                ? this.getShopkeeperAtPointer(event)
                : null;
            const canUseLobbyEntrance = portal === this.duelShopPortal &&
                this.currentArea === "lobby" && this.duelShop.userData.isPlayerNearby;
            const canUseShopExit = portal === this.shopInteriorExitPortal &&
                this.currentArea === "shop" && this.shopInterior.userData.isPlayerNearExit;
            const canUseSeat = seat && seat === this.nearestShopSeat;
            const canTalkToShopkeeper = shopkeeper && this.isNearShopkeeper;
            this.canvas.style.cursor = canUseLobbyEntrance || canUseShopExit || canUseSeat || canTalkToShopkeeper
                ? "pointer"
                : "grab";
        };

        window.addEventListener("keydown", this.handleWorldInteractionKeyDown);
        this.canvas.addEventListener("pointerdown", this.handlePortalPointerDown);
        this.canvas.addEventListener("pointerup", this.handlePortalPointerUp);
        this.canvas.addEventListener("pointermove", this.handlePortalPointerMove);
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * ポインター位置から、クリックされた入口または出口を調べる。
     */
    getPortalAtPointer(event) {
        const bounds = this.canvas.getBoundingClientRect();
        this.portalPointer.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        );
        this.portalRaycaster.setFromCamera(this.portalPointer, this.camera);
        const targets = this.currentArea === "shop"
            ? [this.shopInteriorExitPortal]
            : [this.duelShopPortal];
        return this.portalRaycaster.intersectObjects(targets, false)[0]?.object ?? null;
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * ポインターの先にある椅子を調べ、対応する座席データを返す。
     */
    getShopSeatAtPointer(event) {
        if (!this.shopSeatClickTargets?.length) return null;

        const bounds = this.canvas.getBoundingClientRect();
        this.portalPointer.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        );
        this.portalRaycaster.setFromCamera(this.portalPointer, this.camera);
        const hit = this.portalRaycaster.intersectObjects(this.shopSeatClickTargets, false)[0];
        return hit?.object.userData.shopSeat ?? null;
    }

    /**
     * ===== 店員NPC会話の追加部分 =====
     * ポインターの先に店員NPCがいるかを調べる。
     */
    getShopkeeperAtPointer(event) {
        if (!this.shopkeeperClickTargets?.length) return null;

        const bounds = this.canvas.getBoundingClientRect();
        this.portalPointer.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        );
        this.portalRaycaster.setFromCamera(this.portalPointer, this.camera);
        const hit = this.portalRaycaster.intersectObjects(this.shopkeeperClickTargets, false)[0];
        return hit?.object.userData.shopkeeper ?? null;
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * 最も近い空席を探し、座れる椅子だけを発光させる。
     */
    updateShopSeatProximity() {
        if (!this.shopSeats?.length || this.currentArea !== "shop") return;

        let nearestSeat = null;
        let nearestDistance = Infinity;
        this.shopSeats.forEach(seat => {
            const seatPosition = new THREE.Vector3();
            seat.anchor.getWorldPosition(seatPosition);
            const distance = Math.hypot(
                this.avatar.position.x - seatPosition.x,
                this.avatar.position.z - seatPosition.z
            );
            if (!seat.occupied && distance <= this.shopSeatInteractionRadius && distance < nearestDistance) {
                nearestSeat = seat;
                nearestDistance = distance;
            }
        });

        this.nearestShopSeat = this.isAvatarSeated ? null : nearestSeat;
        this.shopSeats.forEach(seat => {
            const isAvailable = seat === this.nearestShopSeat;
            const isActive = seat === this.activeShopSeat;
            seat.material.emissiveIntensity = isActive ? 1.65 : isAvailable ? 1.25 : 0.45;
        });
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * アバターを椅子へ移動し、脚を前へ曲げた着席姿勢へ切り替える。
     */
    sitOnShopSeat(seat) {
        if (!seat || seat.occupied || this.isAvatarSeated || this.currentArea !== "shop") return;

        const previousPosition = this.avatar.position.clone();
        const seatPosition = new THREE.Vector3();
        seat.anchor.getWorldPosition(seatPosition);
        this.avatar.position.copy(seatPosition);
        this.avatar.rotation.y = seat.chair.rotation.y;
        this.avatar.userData.isMoving = false;

        ["avatar-leg-left", "avatar-leg-right"].forEach(name => {
            const leg = this.avatar.getObjectByName(name);
            if (!leg) return;
            leg.userData.standingPosition ??= leg.position.clone();
            leg.userData.standingRotation ??= leg.rotation.clone();
            leg.position.y = 0.92;
            leg.position.z = 0.38;
            leg.rotation.x = -Math.PI / 2;
        });
        ["avatar-boot-left", "avatar-boot-right"].forEach(name => {
            const boot = this.avatar.getObjectByName(name);
            if (!boot) return;
            boot.userData.standingPosition ??= boot.position.clone();
            boot.userData.standingRotation ??= boot.rotation.clone();
            boot.position.y = 0.9;
            boot.position.z = 0.92;
            boot.rotation.x = -Math.PI / 2;
        });

        seat.occupied = true;
        this.activeShopSeat = seat;
        this.isAvatarSeated = true;
        this.nearestShopSeat = null;
        const movement = this.avatar.position.clone().sub(previousPosition);
        this.camera.position.add(movement);
        this.controls.target.add(movement);
        this.canvas.style.cursor = "grab";
    }

    /**
     * ===== ショップ対戦席の追加部分 =====
     * 椅子の後ろへ立たせ、アバターの脚と靴を通常姿勢へ戻す。
     */
    standFromShopSeat() {
        if (!this.isAvatarSeated || !this.activeShopSeat) return;

        const previousPosition = this.avatar.position.clone();
        const seat = this.activeShopSeat;
        const seatPosition = new THREE.Vector3();
        seat.anchor.getWorldPosition(seatPosition);
        const awayFromTable = new THREE.Vector3(
            -Math.sin(seat.rotationY),
            0,
            -Math.cos(seat.rotationY)
        );
        this.avatar.position.copy(seatPosition).addScaledVector(awayFromTable, 1.05);
        this.avatar.position.y = this.avatarBaseY;

        [
            "avatar-leg-left", "avatar-leg-right",
            "avatar-boot-left", "avatar-boot-right"
        ].forEach(name => {
            const part = this.avatar.getObjectByName(name);
            if (!part?.userData.standingPosition) return;
            part.position.copy(part.userData.standingPosition);
            part.rotation.copy(part.userData.standingRotation);
        });

        seat.occupied = false;
        this.activeShopSeat = null;
        this.isAvatarSeated = false;
        const movement = this.avatar.position.clone().sub(previousPosition);
        this.camera.position.add(movement);
        this.controls.target.add(movement);
        this.updateShopSeatProximity();
    }

    /**
     * ===== 店員NPC会話の追加部分 =====
     * カウンター前の接客位置との距離に応じて、店員の発光を切り替える。
     */
    updateShopkeeperProximity() {
        if (!this.shopkeeperInteractionAnchor || this.currentArea !== "shop") return;

        const interactionPosition = new THREE.Vector3();
        this.shopkeeperInteractionAnchor.getWorldPosition(interactionPosition);
        const distance = Math.hypot(
            this.avatar.position.x - interactionPosition.x,
            this.avatar.position.z - interactionPosition.z
        );
        this.isNearShopkeeper = !this.isAvatarSeated && distance <= this.shopkeeperInteractionRadius;
        this.shopkeeperUniformMaterial.emissiveIntensity = this.isNearShopkeeper ? 1.25 : 0.5;
        this.shopkeeperVisorMaterial.emissiveIntensity = this.isNearShopkeeper ? 3 : 1.8;
        this.shopkeeperInteractionRing.material.opacity = this.isNearShopkeeper ? 0.86 : 0.18;
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * DP・所持カード・購入画面を初期化し、カードJSONの読み込みを始める。
     */
    initializePackShop() {
        this.packShopOverlay = document.getElementById("pack-shop-overlay");
        this.packShopCodeElement = document.getElementById("pack-shop-code");
        this.packShopTitleElement = document.getElementById("pack-shop-title");
        this.shopkeeperDialogueElement = document.getElementById("shopkeeper-dialogue");
        this.shopkeeperDialogueTextElement = document.getElementById("shopkeeper-dialogue-text");
        this.shopkeeperDialogueControlElement = document.getElementById("shopkeeper-dialogue-control");
        this.packShopProductsElement = document.getElementById("pack-shop-products");
        this.packPurchaseConfirmationElement = document.getElementById("pack-purchase-confirmation");
        this.packConfirmationNameElement = document.getElementById("pack-confirmation-name");
        this.packConfirmationPriceElement = document.getElementById("pack-confirmation-price");
        this.packConfirmationDpElement = document.getElementById("pack-confirmation-dp");
        this.packPurchaseConfirmElement = document.getElementById("pack-purchase-confirm");
        this.packOpenResultElement = document.getElementById("pack-open-result");
        this.packResultCardsElement = document.getElementById("pack-result-cards");
        this.packShopMessageElement = document.getElementById("pack-shop-message");
        this.worldDpElement = document.getElementById("world-dp");
        this.worldOwnedCardsElement = document.getElementById("world-owned-cards");
        this.isPackShopOpen = false;
        this.shopkeeperDialogueIndex = 0;
        this.shopkeeperDialogueLines = [];
        this.pendingPackProductId = null;
        this.shopCardCatalog = [];
        this.rareShopCardIds = new Set([
            "04-003", "04-006", "04-021", "04-025", "04-031", "04-038"
        ]);
        this.packProducts = {
            monster: { name: "MONSTER ASSAULT", price: 300, filter: card => card.cardType === "monster" },
            tactics: { name: "TACTICAL FORCE", price: 300, filter: card => card.cardType !== "monster" },
            chaos: { name: "CHAOS LEGENDS", price: 500, filter: () => true, guaranteedRare: true }
        };

        const savedPointsValue = localStorage.getItem("duelMetaverseDp");
        const savedPoints = Number(savedPointsValue);
        this.playerDuelPoints = savedPointsValue !== null && Number.isFinite(savedPoints) && savedPoints >= 0
            ? savedPoints
            : 2000;
        try {
            this.ownedShopCards = JSON.parse(
                localStorage.getItem("duelMetaverseOwnedCards") || "{}"
            );
        } catch {
            this.ownedShopCards = {};
        }
        if (!this.ownedShopCards || Array.isArray(this.ownedShopCards)) {
            this.ownedShopCards = {};
        }
        this.updatePackShopHud();

        document.getElementById("pack-shop-close")?.addEventListener("click", () => {
            this.closePackShop();
        });
        document.getElementById("pack-result-back")?.addEventListener("click", () => {
            this.showPackProducts();
        });
        this.shopkeeperDialogueControlElement?.addEventListener("click", () => {
            this.advanceShopkeeperDialogue();
        });
        document.querySelectorAll("[data-buy-pack]").forEach(button => {
            button.addEventListener("click", () => {
                this.showPackPurchaseConfirmation(button.dataset.buyPack);
            });
        });
        document.getElementById("pack-purchase-cancel")?.addEventListener("click", () => {
            this.showPackProducts();
        });
        this.packPurchaseConfirmElement?.addEventListener("click", () => {
            if (this.pendingPackProductId) this.purchasePack(this.pendingPackProductId);
        });
        this.loadShopCardCatalog();
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 既存カードJSONを読み込み、購入ボタンを利用可能にする。
     */
    async loadShopCardCatalog() {
        try {
            const response = await fetch(new URL("../cards.json", import.meta.url));
            if (!response.ok) throw new Error(`カードデータの取得に失敗しました: ${response.status}`);
            this.shopCardCatalog = await response.json();
            document.querySelectorAll("[data-buy-pack]").forEach(button => {
                button.disabled = false;
            });
            this.updatePackShopHud();
        } catch (error) {
            console.error(error);
            if (this.packShopMessageElement) {
                this.packShopMessageElement.textContent = "CARD DATA UNAVAILABLE";
            }
        }
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 現在のDPと、重複を含む所持カード総数をHUDへ反映する。
     */
    updatePackShopHud() {
        const purchasedCount = Object.values(this.ownedShopCards || {}).reduce(
            (total, count) => total + Number(count || 0),
            0
        );
        const ownedCount = (this.shopCardCatalog?.length || 0) + purchasedCount;
        if (this.worldDpElement) this.worldDpElement.textContent = String(this.playerDuelPoints);
        if (this.worldOwnedCardsElement) this.worldOwnedCardsElement.textContent = String(ownedCount);
    }

    /**
     * ===== 店員NPC会話の追加部分 =====
     * 店員との会話画面を開き、接客の最初のメッセージを表示する。
     */
    startShopkeeperConversation() {
        if (this.currentArea !== "shop" || !this.isNearShopkeeper || !this.packShopOverlay) return;
        this.isPackShopOpen = true;
        this.pressedMovementKeys.clear();
        this.controls.enabled = false;
        this.packShopOverlay.hidden = false;
        this.shopkeeperDialogueIndex = 0;
        const ownedCount = Object.values(this.ownedShopCards).reduce(
            (total, count) => total + Number(count || 0),
            0
        );
        this.shopkeeperDialogueLines = [
            ownedCount > 0
                ? "また来てくれたんですね。今日はどのパックをご覧になりますか？"
                : "いらっしゃいませ。カードパックをお探しですか？",
            "当店では、3種類のカードパックを5枚入りでご用意しています。",
            "それでは、ご希望のパックをお選びください。"
        ];
        this.renderShopkeeperDialogueLine();
        this.showShopkeeperDialogue();
        this.shopkeeperDialogueControlElement?.focus();
    }

    /**
     * ===== 店員NPC会話送りの追加部分 =====
     * 現在のセリフを表示し、途中は三角、最後は四角のボタンへ切り替える。
     */
    renderShopkeeperDialogueLine() {
        if (!this.shopkeeperDialogueLines.length) return;
        const isLastLine = this.shopkeeperDialogueIndex === this.shopkeeperDialogueLines.length - 1;
        if (this.shopkeeperDialogueTextElement) {
            this.shopkeeperDialogueTextElement.textContent =
                this.shopkeeperDialogueLines[this.shopkeeperDialogueIndex];
        }
        if (this.shopkeeperDialogueControlElement) {
            const label = isLastLine ? "会話を終了してパックを見る" : "次の会話";
            this.shopkeeperDialogueControlElement.dataset.mode = isLastLine ? "finish" : "next";
            this.shopkeeperDialogueControlElement.title = label;
            this.shopkeeperDialogueControlElement.setAttribute("aria-label", label);
        }
    }

    /**
     * ===== 店員NPC会話送りの追加部分 =====
     * 三角なら次のセリフへ進み、最後の四角なら会話を終えて商品一覧を開く。
     */
    advanceShopkeeperDialogue() {
        const isLastLine = this.shopkeeperDialogueIndex === this.shopkeeperDialogueLines.length - 1;
        if (isLastLine) {
            this.openPackShop();
            return;
        }
        this.shopkeeperDialogueIndex += 1;
        this.renderShopkeeperDialogueLine();
    }

    showShopkeeperDialogue() {
        if (this.packShopCodeElement) {
            this.packShopCodeElement.textContent = "DUEL SHOP // CUSTOMER SERVICE";
        }
        if (this.packShopTitleElement) this.packShopTitleElement.textContent = "DUEL SHOP";
        if (this.shopkeeperDialogueElement) this.shopkeeperDialogueElement.hidden = false;
        if (this.packShopProductsElement) this.packShopProductsElement.hidden = true;
        if (this.packPurchaseConfirmationElement) this.packPurchaseConfirmationElement.hidden = true;
        if (this.packOpenResultElement) this.packOpenResultElement.hidden = true;
        if (this.packShopMessageElement) this.packShopMessageElement.textContent = "";
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 店員との会話で選択された時だけ、カードパック一覧を表示する。
     */
    openPackShop() {
        if (!this.isPackShopOpen || this.currentArea !== "shop") return;
        this.showPackProducts();
    }

    closePackShop() {
        if (!this.isPackShopOpen || !this.packShopOverlay) return;
        this.isPackShopOpen = false;
        this.pendingPackProductId = null;
        this.packShopOverlay.hidden = true;
        this.controls.enabled = true;
        this.canvas.style.cursor = "grab";
    }

    showPackProducts() {
        if (this.packShopCodeElement) {
            this.packShopCodeElement.textContent = "DUEL SHOP // PACK TERMINAL";
        }
        if (this.packShopTitleElement) this.packShopTitleElement.textContent = "CARD PACKS";
        if (this.shopkeeperDialogueElement) this.shopkeeperDialogueElement.hidden = true;
        if (this.packShopProductsElement) this.packShopProductsElement.hidden = false;
        if (this.packPurchaseConfirmationElement) this.packPurchaseConfirmationElement.hidden = true;
        if (this.packOpenResultElement) this.packOpenResultElement.hidden = true;
        this.pendingPackProductId = null;
        if (this.packShopMessageElement) this.packShopMessageElement.textContent = "";
    }

    /**
     * ===== カードパック購入確認の追加部分 =====
     * 選択されたパックと価格を表示し、決定されるまでDPを消費しない。
     */
    showPackPurchaseConfirmation(productId) {
        const product = this.packProducts[productId];
        if (!product || !this.isPackShopOpen) return;

        this.pendingPackProductId = productId;
        this.packPurchaseConfirmationElement.dataset.pack = productId;
        this.packConfirmationNameElement.textContent = product.name;
        this.packConfirmationPriceElement.textContent = String(product.price);
        this.packConfirmationDpElement.textContent = String(this.playerDuelPoints);
        this.packPurchaseConfirmElement.disabled = this.playerDuelPoints < product.price;
        this.packShopProductsElement.hidden = true;
        this.packPurchaseConfirmationElement.hidden = false;
        this.packOpenResultElement.hidden = true;
        this.packShopMessageElement.textContent = this.playerDuelPoints < product.price
            ? "DPが足りません。"
            : "";
        this.packPurchaseConfirmElement.focus();
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * DPを消費して5枚を抽選し、所持カードへ加えて保存する。
     */
    purchasePack(productId) {
        const product = this.packProducts[productId];
        if (!product || !this.shopCardCatalog.length) return;
        if (this.playerDuelPoints < product.price) {
            this.packShopMessageElement.textContent = "NOT ENOUGH DP";
            return;
        }

        const pool = this.shopCardCatalog.filter(product.filter);
        if (!pool.length) return;
        const drawnCards = [];
        const normalDrawCount = product.guaranteedRare ? 4 : 5;
        for (let index = 0; index < normalDrawCount; index += 1) {
            drawnCards.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        if (product.guaranteedRare) {
            const rarePool = this.shopCardCatalog.filter(card => this.rareShopCardIds.has(card.id));
            drawnCards.push(rarePool[Math.floor(Math.random() * rarePool.length)]);
        }

        this.playerDuelPoints -= product.price;
        drawnCards.forEach(card => {
            this.ownedShopCards[card.id] = (this.ownedShopCards[card.id] || 0) + 1;
        });
        localStorage.setItem("duelMetaverseDp", String(this.playerDuelPoints));
        localStorage.setItem("duelMetaverseOwnedCards", JSON.stringify(this.ownedShopCards));
        this.updatePackShopHud();
        this.renderPackResults(drawnCards);
    }

    /**
     * ===== 商品棚・カードパック購入の追加部分 =====
     * 抽選された5枚を、カード種類に応じた色で購入結果へ表示する。
     */
    renderPackResults(cards) {
        this.packResultCardsElement.replaceChildren();
        cards.forEach((card, index) => {
            const cardElement = document.createElement("article");
            cardElement.className = "pack-result-card";
            cardElement.dataset.cardType = card.cardType;
            cardElement.dataset.cardId = card.id;
            cardElement.style.animationDelay = `${index * 70}ms`;

            const name = document.createElement("strong");
            name.textContent = card.name;
            const details = document.createElement("span");
            details.textContent = card.cardType === "monster"
                ? `MONSTER // ATK ${card.atk}`
                : card.cardType.toUpperCase();
            const owned = document.createElement("span");
            owned.textContent = `OWNED ×${this.ownedShopCards[card.id]}`;
            cardElement.append(name, details, owned);
            this.packResultCardsElement.append(cardElement);
        });

        this.packShopProductsElement.hidden = true;
        this.packPurchaseConfirmationElement.hidden = true;
        this.packOpenResultElement.hidden = false;
        this.pendingPackProductId = null;
        this.packShopMessageElement.textContent = `DP ${this.playerDuelPoints}`;
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * アバターとカメラを店内の入口付近へ移動する。
     */
    enterShopInterior() {
        if (this.currentArea !== "lobby") return;

        this.currentArea = "shop";
        this.isAvatarSeated = false;
        this.activeShopSeat = null;
        this.pressedMovementKeys.clear();
        this.setLobbyEnvironmentVisible(false);
        this.shopInterior.visible = true;
        const spawnPosition = new THREE.Vector3();
        this.shopInteriorSpawnAnchor.getWorldPosition(spawnPosition);
        this.avatar.position.copy(spawnPosition);
        this.avatar.rotation.y = Math.PI;
        this.avatar.userData.isMoving = false;
        // ===== ショップ店内拡張の追加部分 =====
        // 高めの入口カメラから左右の販売・対戦エリアを見渡せるようにする。
        this.camera.position.set(spawnPosition.x, 14, spawnPosition.z + 7.5);
        this.controls.target.set(spawnPosition.x, 1.4, spawnPosition.z - 6.5);
        this.controls.update();
        this.canvas.style.cursor = "grab";
        document.body.dataset.worldArea = "shop";
        if (this.statusElement) this.statusElement.textContent = "DUEL SHOP // INTERIOR";
        const sector = document.querySelector(".world-sector strong");
        if (sector) sector.textContent = "01";
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * 店内出口から、ロビーのショップ入口前へ戻す。
     */
    leaveShopInterior() {
        if (this.currentArea !== "shop") return;

        // ===== ショップ対戦席の追加部分 =====
        // デバッグ操作などで着席中に退出しても、姿勢を確実に元へ戻す。
        if (this.isAvatarSeated) this.standFromShopSeat();
        if (this.isPackShopOpen) this.closePackShop();

        this.currentArea = "lobby";
        this.pressedMovementKeys.clear();
        this.shopInterior.visible = false;
        this.setLobbyEnvironmentVisible(true);
        const returnPosition = new THREE.Vector3();
        this.duelShopEntranceAnchor.getWorldPosition(returnPosition);
        returnPosition.y = this.avatarBaseY;
        this.avatar.position.copy(returnPosition);
        this.avatar.rotation.y = this.duelShop.rotation.y + Math.PI;
        this.avatar.userData.isMoving = false;
        this.camera.position.set(returnPosition.x + 12, 9, returnPosition.z + 14);
        this.controls.target.set(returnPosition.x, 1.4, returnPosition.z);
        this.controls.update();
        this.canvas.style.cursor = "grab";
        document.body.dataset.worldArea = "lobby";
        if (this.statusElement) this.statusElement.textContent = "LOBBY ENVIRONMENT ONLINE";
        const sector = document.querySelector(".world-sector strong");
        if (sector) sector.textContent = "00";
    }

    /**
     * ===== ショップ店内フィールドの追加部分 =====
     * 店内出口との距離に応じて、出口の発光を切り替える。
     */
    updateShopInteriorExitProximity() {
        if (!this.shopInterior || !this.avatar) return;

        const exitPosition = new THREE.Vector3();
        this.shopInteriorExitAnchor.getWorldPosition(exitPosition);
        const distance = Math.hypot(
            this.avatar.position.x - exitPosition.x,
            this.avatar.position.z - exitPosition.z
        );
        const isNearby = distance <= this.shopInteriorInteractionRadius;
        this.shopInterior.userData.isPlayerNearExit = isNearby;
        this.shopInteriorExitRing.material.opacity = isNearby ? 0.9 : 0.25;
        this.shopInteriorExitPortal.material.emissiveIntensity = isNearby ? 2.15 : 1.05;
        this.shopInteriorExitPortal.material.opacity = isNearby ? 0.76 : 0.5;
        this.shopInteriorExitLight.intensity = isNearby ? 48 : 34;
    }

    createBoundaryMarkers() {
        const geometry = new THREE.BoxGeometry(0.16, 2.7, 0.16);
        const material = new THREE.MeshStandardMaterial({
            color: 0x263946,
            emissive: 0x17616b,
            emissiveIntensity: 1.2,
            metalness: 0.7,
            roughness: 0.3
        });
        const positions = [
            [-9, -9], [0, -9], [9, -9],
            [-9, 9], [0, 9], [9, 9],
            // デュエルショップの入口を塞がないよう、左側の1本は奥へ移動する。
            [-15, 7], [9, 0]
        ];
        positions.forEach(([x, z], index) => {
            const marker = new THREE.Mesh(geometry, material);
            marker.position.set(x, 1.35, z);
            marker.scale.y = index % 2 === 0 ? 1 : 0.62;
            marker.castShadow = true;
            this.scene.add(marker);
        });
    }

    resize() {
        const width = Math.max(1, this.canvas.clientWidth);
        const height = Math.max(1, this.canvas.clientHeight);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const renderWidth = Math.floor(width * pixelRatio);
        const renderHeight = Math.floor(height * pixelRatio);

        if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
            this.renderer.setSize(renderWidth, renderHeight, false);
        }
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    setReady() {
        this.loadingElement?.classList.add("hidden");
        const status = this.statusElement?.closest(".world-status");
        status?.classList.add("ready");
        if (this.statusElement) this.statusElement.textContent = "LOBBY ENVIRONMENT ONLINE";
        document.body.dataset.worldReady = "true";
    }

    start() {
        if (this.animationFrameId !== null) return;
        this.clock.start();
        this.animate();
    }

    stop() {
        if (this.animationFrameId === null) return;
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
        this.clock.stop();
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.05);
        this.elapsedTime += deltaTime;
        const elapsed = this.elapsedTime;

        // ===== アバター移動の追加部分 =====
        // フレーム間隔を渡すことで、PC性能に左右されにくい移動速度にする。
        this.updateAvatarMovement(deltaTime);

        if (this.currentArea === "lobby") {
            // ===== デュエルテーブル表示の追加部分 =====
            // テーブルへ近づいたことが視覚的に分かるよう、毎フレーム距離を確認する。
            this.updateDuelTableProximity();

            // ===== デュエルショップ表示の追加部分 =====
            // 入口へ近づいた時だけ、ショップの案内表示を強調する。
            this.updateDuelShopProximity();
        } else {
            // ===== ショップ店内フィールドの追加部分 =====
            // 店内ではロビー側の代わりに、出口との距離を確認する。
            this.updateShopInteriorExitProximity();

            // ===== ショップ対戦席の追加部分 =====
            // 近づいた椅子を検出し、座れる席だけを発光させる。
            this.updateShopSeatProximity();

            // ===== 店員NPC会話の追加部分 =====
            // カウンター前へ近づいた時だけ、店員との会話を有効にする。
            this.updateShopkeeperProximity();
        }
        this.controls.update();
        if (this.scanRing) {
            this.scanRing.material.opacity = 0.62 + Math.sin(elapsed * 1.7) * 0.18;
            this.scanRing.rotation.z = elapsed * 0.08;
        }

        // ===== アバター表示の追加部分 =====
        // 停止中は呼吸、移動中は歩行を表す速めの上下運動を与える。
        if (this.avatar && !this.isAvatarSeated) {
            const isMoving = Boolean(this.avatar.userData.isMoving);
            const bobSpeed = isMoving ? 8.5 : 1.8;
            const bobAmount = isMoving ? 0.055 : 0.025;
            this.avatar.position.y = this.avatarBaseY + Math.sin(elapsed * bobSpeed) * bobAmount;
        }

        // ===== オンラインアバター同期の追加部分 =====
        // 受信座標の間を補間し、他プレイヤーを滑らかに表示する。
        this.updateRemotePlayers(deltaTime);

        // ===== PSO2風オンラインチャットの追加部分 =====
        // 3D座標を画面上へ投影し、発言者の頭上へ吹き出しを追従させる。
        this.updateChatBubbles();

        this.renderer.render(this.scene, this.camera);
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
}

function showStartupError(error) {
    console.error("メタバース空間の初期化に失敗しました:", error);
    document.getElementById("world-loading")?.classList.add("hidden");
    const errorElement = document.getElementById("world-error");
    if (errorElement) errorElement.hidden = false;
}

try {
    const app = new MetaverseApp({
        canvas: document.getElementById("metaverse-canvas"),
        loadingElement: document.getElementById("world-loading"),
        statusElement: document.getElementById("world-status-text"),
        errorElement: document.getElementById("world-error")
    });
    window.metaverseApp = app;
    window.metaverseTitleScreen = new MetaverseTitleScreen({
        element: document.getElementById("title-screen"),
        form: document.getElementById("player-name-form"),
        input: document.getElementById("player-name-input"),
        messageElement: document.getElementById("player-name-message"),
        onEnter: playerName => app.enterOnlineWorld(playerName)
    });
} catch (error) {
    showStartupError(error);
}
