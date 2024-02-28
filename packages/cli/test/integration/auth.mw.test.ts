import { ActiveWorkflowRunner } from '@/ActiveWorkflowRunner';

import type { SuperAgentTest } from 'supertest';
import * as utils from './shared/utils/';
import { createUser } from './shared/db/users';
import { mockInstance } from '../shared/mocking';

describe('Auth Middleware', () => {
	mockInstance(ActiveWorkflowRunner);

	const testServer = utils.setupTestServer({
		endpointGroups: ['me', 'auth', 'owner', 'users', 'invitations'],
	});

	/** Routes requiring a valid `n8n-auth` cookie for a user, either owner or member. */
	const ROUTES_REQUIRING_AUTHENTICATION: Readonly<Array<[string, string]>> = [
		['PATCH', '/me'],
		['PATCH', '/me/password'],
		['POST', '/me/survey'],
		['POST', '/owner/setup'],
	];

	/** Routes requiring a valid `n8n-auth` cookie for an owner. */
	const ROUTES_REQUIRING_AUTHORIZATION: Readonly<Array<[string, string]>> = [
		['POST', '/invitations'],
		['DELETE', '/users/123'],
		['POST', '/owner/setup'],
	];

	describe('Routes requiring Authentication', () => {
		ROUTES_REQUIRING_AUTHENTICATION.concat(ROUTES_REQUIRING_AUTHORIZATION).forEach(
			([method, endpoint]) => {
				test(`${method} ${endpoint} should return 401 Unauthorized if no cookie`, async () => {
					const { statusCode } = await testServer.authlessAgent[method.toLowerCase()](endpoint);
					expect(statusCode).toBe(401);
				});
			},
		);
	});

	describe('Routes requiring Authorization', () => {
		let authMemberAgent: SuperAgentTest;
		beforeAll(async () => {
			const member = await createUser({ role: 'global:member' });
			authMemberAgent = testServer.authAgentFor(member);
		});

		ROUTES_REQUIRING_AUTHORIZATION.forEach(async ([method, endpoint]) => {
			test(`${method} ${endpoint} should return 403 Forbidden for member`, async () => {
				const { statusCode } = await authMemberAgent[method.toLowerCase()](endpoint);
				expect(statusCode).toBe(403);
			});
		});
	});
});
