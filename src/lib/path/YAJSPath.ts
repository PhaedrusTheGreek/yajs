import { ANTLRInputStream, CommonTokenStream } from 'antlr4ts';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree';
import { Iterable } from 'ts-iterable';
import { ChildNode } from './operator/ChildNode';
import { Descendant } from './operator/Descendant';
import { Root } from './operator/Root';
import { Wildcard } from './operator/Wildcard';
import { extractKeys } from './parser/utils';
import { YAJSLexer } from './parser/YAJSLexer';
import { PathStepContext, ProjectExpressionContext, YAJSParser } from './parser/YAJSParser';
import { PathOperator } from './PathOperator';
import { PathParent } from './PathParent';

export class YAJSPath extends Iterable<PathOperator> {

    protected operators: PathOperator[];
    protected size: number = 0;

    private mProjectionKeys: string[];
    private mDefinite = true;
    private mMinimumDepth = 0;

    constructor(operators: PathOperator[] = [], projectionKeys: string[] = []) {
        super();
        this.operators = [];
        this.mProjectionKeys = projectionKeys;

        [ new Root() ].concat(operators).
            forEach((op) => this.push(op));

        if (this.peek().getType() === PathOperator.Type.DESCENDANT) {
            throw new Error('Descendant shouldn\'t be the last operator.');
        }

        this.operators.forEach((operator) => {
            if (operator.getType() !== PathOperator.Type.DESCENDANT) {
                this.mMinimumDepth++;
            } else {
                this.mDefinite = false;
            }
        });
    }

    match(jsonPath: YAJSPath): boolean {
        let pointer1 = this.size - 1;
        let pointer2 = jsonPath.size - 1;

        if (!this.operators[pointer1].match(jsonPath.operators[pointer2])) {
            return false;
        }

        while (pointer1 >= 0) {
            if (pointer2 < 0) {
                return false;
            }

            const o1 = this.operators[pointer1--];
            let o2 = jsonPath.operators[pointer2--];

            if (o1.getType() === PathOperator.Type.DESCENDANT) {
                const prevScan = this.operators[pointer1--];
                while (!prevScan.match(o2) && pointer2 >= 0) {
                    o2 = jsonPath.operators[pointer2--];
                }
            } else if (o2.getType() === PathOperator.Type.ARRAY) {
                pointer1++;
            } else if (!o1.match(o2)) {
                return false;
            }
        }

        return pointer2 < 0;
    }

    peek(): PathOperator {
        return this.operators[this.size - 1];
    }

    clear(): void {
        this.operators = [];
    }

    pathDepth(): number {
        return this.size;
    }

    path(): string[] {
        return this.operators.
            slice(0, this.size).
            map((op) =>
                op instanceof ChildNode &&
                (op as ChildNode).key).
            filter((key) => key) as string[];

    }

    get definite(): boolean {
        return this.mDefinite;
    }

    get minimumDepth(): number {
        return this.mDefinite ?
            this.size :
            this.mMinimumDepth;
    }

    get projectionKeys(): string[] {
        return this.mProjectionKeys;
    }
    protected current(key: number): PathOperator {
        return this.operators[key];
    }

    protected valid(key: number): boolean {
        return key < this.size;
    }

    protected push(operator: PathOperator): void {
        const parent = this.operators[this.size - 1];
        operator.parent = new PathParent(parent);
        this.operators[this.size++] = operator;
    }

    protected pop(): void {
        this.size--;
    }
}

export namespace YAJSPath {

    // tslint:disable-next-line:max-classes-per-file
    export class Builder {

        private operators: PathOperator[] = [];

        private projectionKeys?: string[];

        addChild(key: string, filterExpression?: string, filterKeys?: string[]): Builder {
            this.operators.push(new ChildNode(key, filterExpression, filterKeys));
            return this;
        }

        addWildcard(filterExpression?: string, filterKeys?: string[]): Builder {
            this.operators.push(new Wildcard(filterExpression, filterKeys));
            return this;
        }

        addDescendant(): Builder {
            const last = this.operators[this.operators.length - 1];
            if (!last || last.getType() !== PathOperator.Type.DESCENDANT) {
                this.operators.push(new Descendant());
            }
            return this;
        }

        setProjection(...keys: string[]): Builder {
            this.projectionKeys = keys;
            return this;
        }

        build(): YAJSPath {
            const operators = this.operators;
            this.operators = [];
            return new YAJSPath(operators, this.projectionKeys);
        }
    }

    export function parse(path: string): YAJSPath {

        const inputStream = new ANTLRInputStream(path);
        const lexer = new YAJSLexer(inputStream);
        const tokenStream = new CommonTokenStream(lexer);
        const parser = new YAJSParser(tokenStream);

        return new Visitor().
            visit(parser.path()).
            build();
    }

    // tslint:disable-next-line:max-classes-per-file
    class Visitor extends AbstractParseTreeVisitor<YAJSPath.Builder> {

        private readonly builder = new YAJSPath.Builder();

        visitPathStep(ctx: PathStepContext): YAJSPath.Builder {
            if (ctx.DOT().length === 2) {
                this.builder.addDescendant();
            }

            const fieldName = ctx.actionField()._key.text;
            if (!fieldName) {
                throw new Error('Unexpected empty fieldname');
            }

            const actionFilter = ctx.actionFilter();
            let filterExpression;
            let filterKeys;

            if (actionFilter) {
                filterExpression = actionFilter.filterExpression().text;
                filterKeys = extractKeys(actionFilter.filterExpression());
            }

            if ('*' === fieldName) {
                this.builder.addWildcard(filterExpression, filterKeys);
            } else {
                this.builder.addChild(fieldName, filterExpression, filterKeys);
            }

            return this.builder;
        }

        visitProjectExpression(ctx: ProjectExpressionContext): YAJSPath.Builder {
            this.builder.setProjection(...ctx.Identifier().map((i) => i.text));
            return this.builder;
        }

        protected defaultResult(): YAJSPath.Builder {
            return this.builder;
        }
    }
}