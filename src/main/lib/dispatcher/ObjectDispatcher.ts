import { isEmpty, pick } from 'lodash';
import { ScriptFilterHelper } from '../utils/ScriptFilterHelper';
import { AbstractObjectBuilder } from './AbstractObjectBuilder';

export class ObjectDispatcher extends AbstractObjectBuilder {

    private listener?: (value?: any) => void;

    private filterHelper: ScriptFilterHelper;

    constructor(listener: (value?: any) => void, projectExpression: string = '', projectKeys: string[] = []) {
        super();
        this.listener = listener;
        this.filterHelper = new ScriptFilterHelper(projectKeys, projectExpression);
    }

    endObject(): boolean {
        this.doEndObject();
        if (this.isInRoot()) {
            const result: any = this.peek().value;
            if (this.listener) {
                if (this.filterHelper.isFiltered()) {
                    if (this.filterHelper.filters((key) => key in result)) {
                        this.listener(result);
                    }
                } else {
                    this.listener(result);
                }
            }
            return true;
        }
        return false;
    }

    endArray(): boolean {
        this.doEndArray();
        return this.isInRoot();
    }
}
