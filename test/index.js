'use strict';

const chai      = require('chai');
const coMocha   = require('co-mocha');
const expect    = chai.expect;

const TransformerZopfli = require('../');
const Tree      = require('shark-tree');
const Logger    = require('shark-logger');
const cofse     = require('co-fs-extra');
const path      = require('path');
const sprintf   = require('extsprintf').sprintf;

describe('Initialization', function() {
	before(function *() {
		this.logger = Logger({
			name: 'TransformerBlessLogger'
		});

		this.files = {};
		this.src1 = path.join(__dirname, './fixtures/test.src.css');
		this.dest1 = path.join(__dirname, './fixtures/test.dest.css');
		this.expectDest1 = path.join(__dirname, './fixtures/test.dest.expect.css');

		yield cofse.writeFile(this.dest1, '');

		this.files[this.dest1] = {
			files: [this.src1],
			options: {
				bless: {
					enabled: true
				}
			}
		};

		this.tree = yield Tree(this.files, this.logger);
	});

	it('should gzip css', function *() {
		try {
			var tree = yield TransformerZopfli.treeToTree(this.tree, this.logger);

			expect(tree.hasDest(this.dest1.replace('.css', '.css.gz'))).to.be.not.undefined();
		}
		catch (error) {
			console.error(sprintf('%r', error));
		}
	})
});
