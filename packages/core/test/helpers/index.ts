import { readdirSync, readFileSync } from 'fs';
import { mock } from 'jest-mock-extended';
import type {
	IDataObject,
	IDeferredPromise,
	INodeType,
	INodeTypes,
	IRun,
	IVersionedNodeType,
	IWorkflowBase,
	IWorkflowExecuteAdditionalData,
	NodeLoadingDetails,
	WorkflowTestData,
	INodeTypeData,
} from 'n8n-workflow';
import { ApplicationError, NodeHelpers } from 'n8n-workflow';
import path from 'path';

import { UnrecognizedNodeTypeError } from '@/errors';
import { ExecutionLifecycleHooks } from '@/execution-lifecycle-hooks';

import { predefinedNodesTypes } from './constants';

const BASE_DIR = path.resolve(__dirname, '../../..');

class NodeTypesClass implements INodeTypes {
	constructor(private nodeTypes: INodeTypeData) {}

	getByName(nodeType: string): INodeType | IVersionedNodeType {
		return this.nodeTypes[nodeType].type;
	}

	getByNameAndVersion(nodeType: string, version?: number): INodeType {
		return NodeHelpers.getVersionedNodeType(this.nodeTypes[nodeType].type, version);
	}

	getKnownTypes(): IDataObject {
		throw new Error('Method not implemented.');
	}
}

let nodeTypesInstance: NodeTypesClass | undefined;

export function NodeTypes(nodeTypes: INodeTypeData = predefinedNodesTypes): INodeTypes {
	if (nodeTypesInstance === undefined || nodeTypes !== undefined) {
		nodeTypesInstance = new NodeTypesClass(nodeTypes);
	}

	return nodeTypesInstance;
}

export function WorkflowExecuteAdditionalData(
	waitPromise: IDeferredPromise<IRun>,
	nodeExecutionOrder: string[],
): IWorkflowExecuteAdditionalData {
	const hooks = new ExecutionLifecycleHooks('trigger', '1', mock());
	hooks.addCallback('nodeExecuteAfter', async (nodeName): Promise<void> => {
		nodeExecutionOrder.push(nodeName);
	});
	hooks.addCallback('workflowExecuteAfter', async (fullRunData): Promise<void> => {
		waitPromise.resolve(fullRunData);
	});
	return mock<IWorkflowExecuteAdditionalData>({ hooks });
}

const preparePinData = (pinData: IDataObject) => {
	const returnData = Object.keys(pinData).reduce(
		(acc, key) => {
			const data = pinData[key] as IDataObject[];
			acc[key] = [data];
			return acc;
		},
		{} as {
			[key: string]: IDataObject[][];
		},
	);
	return returnData;
};

const readJsonFileSync = <T>(filePath: string) =>
	JSON.parse(readFileSync(path.join(BASE_DIR, filePath), 'utf-8')) as T;

export function getNodeTypes(testData: WorkflowTestData[] | WorkflowTestData) {
	if (!Array.isArray(testData)) {
		testData = [testData];
	}

	const nodeTypes: INodeTypeData = {};

	const nodes = [...new Set(testData.flatMap((data) => data.input.workflowData.nodes))];

	const nodeNames = nodes.map((n) => n.type);

	const knownNodes = readJsonFileSync<Record<string, NodeLoadingDetails>>(
		'nodes-base/dist/known/nodes.json',
	);

	for (const nodeName of nodeNames) {
		const loadInfo = knownNodes[nodeName.replace('n8n-nodes-base.', '')];
		if (!loadInfo) {
			throw new UnrecognizedNodeTypeError('n8n-nodes-base', nodeName);
		}
		const sourcePath = loadInfo.sourcePath.replace(/^dist\//, './').replace(/\.js$/, '.ts');
		const nodeSourcePath = path.join(BASE_DIR, 'nodes-base', sourcePath);
		const node = new (require(nodeSourcePath)[loadInfo.className])() as INodeType;
		nodeTypes[nodeName] = {
			sourcePath: '',
			type: node,
		};
	}

	return nodeTypes;
}

const getWorkflowFilenames = (dirname: string, testFolder = 'workflows') => {
	const workflows: string[] = [];

	const filenames: string[] = readdirSync(`${dirname}${path.sep}${testFolder}`);

	filenames.forEach((file) => {
		if (file.endsWith('.json')) {
			workflows.push(path.join('core', 'test', testFolder, file));
		}
	});

	return workflows;
};

export const workflowToTests = (dirname: string, testFolder = 'workflows') => {
	const workflowFiles: string[] = getWorkflowFilenames(dirname, testFolder);

	const testCases: WorkflowTestData[] = [];

	for (const filePath of workflowFiles) {
		const description = filePath.replace('.json', '');
		const workflowData = readJsonFileSync<IWorkflowBase>(filePath);
		if (workflowData.pinData === undefined) {
			throw new ApplicationError('Workflow data does not contain pinData');
		}

		const nodeData = preparePinData(workflowData.pinData);

		delete workflowData.pinData;

		const input = { workflowData };
		const output = { nodeData };

		testCases.push({ description, input, output });
	}
	return testCases;
};
