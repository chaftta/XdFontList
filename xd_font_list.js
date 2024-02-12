const fs = require('fs');
const AdmZip = require('adm-zip');

/** フォント情報 */
class FontData {
	/** @var {string} フォント名 */
	name;
	/** @var {string} スタイル */
	style;
	/** @var {string} 正規化したフォント名 */
	postScriptName;
	/** @var {string[]} 使用箇所 */
	usages;
	/**
	 * コンストラクタ
	 * @param {string} name フォント名
	 * @param {string} style スタイル
	 * @param {string} postScriptName 正規化したフォント名
	 */
	constructor(name, style, postScriptName) {
		this.name = name;
		if (style === null || style === undefined) style = "";
		this.style = style;
		this.postScriptName = postScriptName;
		this.usages = [];
	}
	/** ユニークになるIDを生成して返す */
	get id() {
		return this.postScriptName;
		// return this.name + ":"  + this.style;
	}
	/**
	 * 使用箇所を追加
	 * @param name 使用箇所の名前
	 */
	addUsage(name) {
		if(this.usages.includes(name)) return;
		this.usages.push(name);
	}
	getUsages() {
		let r = this.name + ':' + this.style + '\n';
		for(const usage of this.usages) {
			r += '  - ' + usage + '\n';
		}
		return r;
	}
}
/** アートボード */
class ArtBoardIndex {
	/** @var {string} オブジェクトID */
	id;
	/** @var {string} アートボード名 */
	name;
	/** @var {string} アートボードパス */
	path;
	/** @var {Object} 元オブジェクト */
	contents
	/**
	 * コンストラクタ
	 * @param {Object} object オブジェクト
	 */
	constructor(object) {
		this.contents = object;
		this.id = object.id;
		this.name = object.name;
		this.path = object.path;
	}
	/**
	 * 読み込み完了しているか
	 * @returns {boolean} true: 完了 false: 未完了
	 */
	get isLoaded() {
		return this.contents !== undefined && this.contents !== null;
	}
	/**
	 * アートワークの種別がアートボードかどうか
	 * @returns {boolean} true: アートボード false: 非アートボード
	 */
	get isArtBoard() {
		return this.path.startsWith('artboard');
	}
	/**
	 * 定義データのパスを取得する
	 * @returns {string} 定義データのパス
	 */
	getDataPath() {
		return 'artwork/' + this.path + '/graphics/graphicContent.agc';
	}
}
/** XDのマニフェスト */
class Manifest {
	/** @var {Object} 元のマニフェスト */
	manifest;
	get isLoaded() {
		return this.manifest !== undefined && this.manifest !== null;
	}
	constructor(json) {
		this.manifest = JSON.parse(json);
	}
	/**
	 * アートワークを取得する
	 * @returns {undefined | Object} アートワーク
	 */
	getArtWork() {
		if (this.manifest === undefined) return undefined;
		if (this.manifest.children === undefined) return undefined;
		for(let child of this.manifest.children) {
			if (child.name === 'artwork') return child;
		}
		return undefined;
	}
	/**
	 * アートボード一覧を取得する
	 * @returns {undefined | ArtBoardIndex[]} アートボード一覧
	 */
	getArtBoards() {
		const artWork = this.getArtWork();
		if (artWork === undefined || artWork.children === undefined) return undefined;
		// アートボード一覧の作成
		let artBoards = [];
		for(let child of artWork.children) {
			// ペーストボードは処理しない
			if (child.name === 'pasteboard') continue;
			const board = new ArtBoardIndex(child);
			if (!board.isLoaded) continue;
			artBoards.push(board);
		}
		return artBoards;
	}
}
/** アートボード */
class ArtBoard {
	/** フォント一覧 */
	fonts = {};
	/** @var {Object} 元オブジェクト */
	contents;

	/**
	 * 読み込み完了しているか
	 * @returns {boolean} true: 完了 false: 未完了
	 */
	get isLoaded() {
		return this.contents !== null;
	}

	/**
	 * コンストラクタ
	 * @param json JSON文字列
	 */
	constructor(json) {
		this.contents = JSON.parse(json);
	}
	/**
	 * 使用フォント情報を更新する
	 */
	updateFonts() {
		this.fonts = {};
		if (this.contents) this.findFonts(this.contents);
	}
	/**
	 * フォントを探して、フォント情報一覧に追加する
	 * @param obj
	 */
	findFonts(obj) {
		if (Array.isArray(obj)) {
			obj.forEach(item => this.findFonts(item));
		} else if (obj && typeof obj === 'object') {
			if (obj.fontFamily !== undefined) {
				const font = new FontData(obj.fontFamily, obj.fontStyle, obj.postscriptName)
				this.fonts[font.id] = font;
			}
			Object.keys(obj).forEach(k => {
				if (k === 'font') {
					// フォント情報の場合
					const font = new FontData(obj[k]['family'], obj[k]['style'], obj[k]['postscriptName']);
					this.fonts[font.id] = font;
				}
				this.findFonts(obj[k]);
			});
		}
	}
}
/** XDのフォント情報を整理するクラス */
class XdFonts {
	/**
	 * リストを生成する
	 * @param {string} filePath xdファイルパス
	 * @returns {Object.<string, FontData>} フォント一覧
	 */
	async makeList(filePath) {
		const fonts = {};
		// noinspection JSCheckFunctionSignatures
		const zip = new AdmZip(filePath);

		const manifestEntry = zip.getEntry('manifest');
		const manifest = new Manifest(manifestEntry.getData().toString('utf8'));
		if (!manifest.isLoaded) {
			console.log('マニフェストの読み込みに失敗しました');
			return fonts;
		}
		/** @var {ArtBoardIndex[]} indices */
		const indices = manifest.getArtBoards();
		if (indices === undefined) return fonts;
		// アートボード一覧を処理
		for(let index of indices) {
			const dataPath = index.getDataPath();
			const entry = zip.getEntry(dataPath);
			// アートボードを取得
			const artBoard = new ArtBoard(entry.getData().toString('utf8'))
			if (!artBoard.isLoaded) {
				console.log(dataPath + "の読み込みに失敗しました");
				continue;
			}
			artBoard.updateFonts();
			Object.keys(artBoard.fonts).forEach(key => {
				if (fonts.hasOwnProperty(key)) {
					// 同じフォントがあるので使用箇所を追加
					const font = fonts[key];
					font.addUsage(index.name + ` [${index.id}]`);
				} else {
					fonts[key] = artBoard.fonts[key];
				}
			});
		}
		return fonts;
	}
}

// パラメータからxdファイルを読み込む
let args = process.argv.slice(2);
(async () => {
	const xdFonts = new XdFonts();
	let fonts = await xdFonts.makeList(args[0]);
	// フォント
	Object.keys(fonts).forEach(key => {
		console.log(`${fonts[key].getUsages()}`);
	});
})();

