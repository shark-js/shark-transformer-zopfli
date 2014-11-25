'use strict';

const Transformer   = require('shark-transformer');
const zopfli        = require('node-zopfli');
const extend        = require('node.extend');
const co            = require('co');
const VError        = require('verror');
const path          = require('path');
const Tree          = require('shark-tree');

const loggerOpName = 'transformer-zopfli';


module.exports = Transformer.extend({
	init: function() {
		this.options = extend({}, this.optionsDefault, this.options);
		this.zopfliResults = {};
	},

	parseBless: function(content, destPath, options) {
		var time = this.logger.time();
		var sizeBefore = content.length;
		try {
			if (!this.logger.inPipe()) {
				this.logger.info({
					opName: loggerOpName,
					opType: this.logger.OP_TYPE.STARTED
				}, path.basename(destPath));
			}

			var result = zopfli.gzipSync(new Buffer(content), options);

			this.logger.info({
				opName: loggerOpName,
				opType: this.logger.OP_TYPE.FINISHED_SUCCESS,
				duration: time.delta(),
				size: {before: sizeBefore, after: result.toString('utf8').length}
			}, this.logger.inPipe() ? '' : path.basename(destPath));

			return result;
		}
		catch (error) {
			this.logger.warn({
				opName: loggerOpName,
				opType: this.logger.OP_TYPE.FINISHED_ERROR,
				duration: time.delta()
			}, path.basename(destPath), error.message);
			throw new VError(error, 'Zopfli error');
		}
	},

	transformTree: function *() {
		try {
			var _tree = this.tree.getTree();
			for (var destPath in _tree) {
				if (_tree.hasOwnProperty(destPath)) {
					yield this.transformTreeConcreteDest(destPath, _tree[destPath]);
				}
			}
		}
		catch (error) {
			throw new VError(error, 'TransformerZopfli#transformTree');
		}
	},

	transformTreeConcreteDest: function *(destPath, srcCollection) {
		return srcCollection.forEachSeries(co.wrap(function *(srcFile, index, done) {
			try {
				var options = extend({}, this.options, srcCollection.getOptions().zopfli);

				if (options.enabled === false) {
					done();
					return;
				}

				var data = this.parseBless(
					srcFile.getContent(),
					destPath,
					options
				);

				this.zopfliResults[destPath] = data;
				done();
			}
			catch (error) {
				done(new VError(error, 'Bless#transformTreeConcreteDest error'));
			}
		}.bind(this)));
	},

	transformTreeWithZopfliResults: function *() {
		var zopfliResults = this.zopfliResults;
		if (Object.keys(zopfliResults).length === 0) {
			return;
		}

		for (var destPath in zopfliResults) {
			if (!zopfliResults.hasOwnProperty(destPath)) {
				continue;
			}

			var ext = path.extname(destPath);

			if (ext === '.gz') {
				continue;
			}
			
			var basename = path.basename(destPath, ext);
			var dirname = path.dirname(destPath);

			var newDestPath = path.join(dirname, basename + ext + '.gz');
			var newFiles = {};
			newFiles[newDestPath] = {
				files: [],
				options: this.tree.getSrcCollectionByDest(destPath).getOptions()
			};

			var newTree = yield Tree(newFiles, this.logger);

			var zopfliResult = zopfliResults[destPath];
			newTree.getSrcCollectionByDest(newDestPath).setContent(zopfliResult);

			this.tree.merge(newTree);
		}
	},

	treeToTree: function *() {
		try {
			yield this.tree.fillContent();

			yield this.transformTree();
			yield this.transformTreeWithZopfliResults();

			return this.tree;
		}
		catch (error) {
			throw new VError(error, 'TransformerZopfli#treeToTree');
		}
	}
});