
import {
	OptionsWithUrl,
 } from 'request';

import {
	IExecuteFunctions,
	IExecuteSingleFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
} from 'n8n-core';

import {
	IDataObject,
 } from 'n8n-workflow';

import {
	createHmac,
} from 'crypto';

import * as qs from 'qs';

export async function unleashedApiRequest(this: IHookFunctions | IExecuteFunctions | IExecuteSingleFunctions | ILoadOptionsFunctions, method: string, path: string, body: any = {}, query: IDataObject = {} , pageNumber?: number, headers?: object): Promise<any> { // tslint:disable-line:no-any

	const paginatedPath = pageNumber ? `/${path}/${pageNumber}` : `/${path}`;

	const options: OptionsWithUrl = {
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
		},
		method,
		qs: query,
		body,
		url: `https://api.unleashedsoftware.com/${paginatedPath}`,
		json: true,
	};

	if (Object.keys(body).length === 0) {
		delete options.body;
	}

	const credentials = this.getCredentials('unleashedSoftwareApi');

	if (credentials === undefined) {

		throw new Error('No credentials got returned!');
	}

	const signature = createHmac('sha256', (credentials.apiKey as string))
		.update(qs.stringify(query))
		.digest('base64');

	options.headers = Object.assign({}, headers, {
		'api-auth-id': credentials.apiId,
		'api-auth-signature': signature,
	});

	try {

		return await this.helpers.request!(options);

	} catch (error) {

		if (error.response && error.response.body && error.response.body.description) {

			throw new Error(`Unleashed Error response [${error.statusCode}]: ${error.response.body.description}`);
		}

		throw error;
	}
}
export async function unleashedApiRequestAllItems(this: IExecuteFunctions | ILoadOptionsFunctions, propertyName: string,  method: string, endpoint: string, body: any = {}, query: IDataObject = {}): Promise<any> { // tslint:disable-line:no-any

	const returnData: IDataObject[] = [];

	let responseData;

	let pageNumber =  1;

	query.pageSize = 1000;

	do {
		responseData = await unleashedApiRequest.call(this, method, endpoint, body, query, pageNumber);

		returnData.push.apply(returnData, responseData[propertyName]);

		pageNumber++;

	} while (
		(responseData.Pagination.PageNumber as number) < (responseData.Pagination.NumberOfPages as number)
	);
	return returnData;
}

//.NET code is serializing dates in the following format: "/Date(1586833770780)/"
//which is useless on JS side and could not treated as a date for other nodes
//so we need to convert all of the fields that has it.
export function convertNETDates(item: {[key: string]: any}){
	Object.keys(item).forEach( path => {
		const type =  typeof item[path] as string;
		if (type === 'string') {
			const value =  item[path] as string;
			const a = /\/Date\((\d*)\)\//.exec(value);
			if (a) {
				item[path] = new Date(+a[1]);
			}
		} if (type === 'object' && item[path]) {
			convertNETDates(item[path]);
		}
	});
}

