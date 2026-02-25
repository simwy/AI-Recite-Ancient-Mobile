'use strict';
require('module-alias/register')
const fs = require('fs')
const path = require('path')
const template = fs.readFileSync(path.join(__dirname, './server/index.html'), 'utf-8')
const manifest = require('./server/ssr-manifest.json')
const render = require('./server/entry-server.js').render

exports.main = async (event, context) => {
	const queryStringParameters = event.queryStringParameters
	const {
		appHtml,
		preloadLinks,
		appContext,
		headMeta
	} = await render(
		Object.keys(queryStringParameters).length > 0 ?
		event.path + '?' +require('querystring').stringify(queryStringParameters) :
		event.path
	)
	const html = template
		.replace(`<!--preload-links-->`, preloadLinks)
		.replace(`<!--app-html-->`, appHtml)
		.replace(`<!--app-context-->`, appContext)
		.replace('<!--head-meta-->', headMeta)
	return {
		mpserverlessComposedResponse: true,
		statusCode: 200,
		headers: {
			'content-type': 'text/html'
		},
		body: html
	}
};
