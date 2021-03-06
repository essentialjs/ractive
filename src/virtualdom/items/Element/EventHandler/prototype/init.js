import getFunctionFromString from 'shared/getFunctionFromString';
import createReferenceResolver from 'virtualdom/items/shared/Resolvers/createReferenceResolver';
import circular from 'circular';
import fireEvent from 'Ractive/prototype/shared/fireEvent';
import log from 'utils/log';

var Fragment, getValueOptions = { args: true }, eventPattern = /^event(?:\.(.+))?/;

circular.push( function () {
	Fragment = circular.Fragment;
});

export default function EventHandler$init ( element, name, template ) {
	var action, refs, ractive;

	this.element = element;
	this.root = element.root;
	this.name = name;

	if( name.indexOf( '*' ) !== -1 ) {
		log.error({
			debug: this.root.debug,
			message: 'noElementProxyEventWildcards',
			args: {
				element: element.tagName,
				event: name
			}
		});

		this.invalid = true;
	}

	if ( template.m ) {
		refs = template.a.r;

		// This is a method call
		this.method = template.m;
		this.keypaths = [];
		this.fn = getFunctionFromString( template.a.s, refs.length );

		this.parentFragment = element.parentFragment;
		ractive = this.root;

		// Create resolvers for each reference
		this.refResolvers = refs.map( ( ref, i ) => {
			var match;

			// special case - the `event` object
			if ( match = eventPattern.exec( ref ) ) {
				this.keypaths[i] = {
					eventObject: true,
					refinements: match[1] ? match[1].split( '.' ) : []
				};

				return null;
			}

			return createReferenceResolver( this, ref, keypath => {
				this.resolve( i, keypath );
			});
		});

		this.fire = fireMethodCall;
	}

	else {
		// Get action ('foo' in 'on-click='foo')
		action = template.n || template;
		if ( typeof action !== 'string' ) {
			action = new Fragment({
				template: action,
				root: this.root,
				owner: this
			});
		}

		this.action = action;

		// Get parameters
		if ( template.d ) {
			this.dynamicParams = new Fragment({
				template: template.d,
				root: this.root,
				owner: this.element
			});

			this.fire = fireEventWithDynamicParams;
		} else if ( template.a ) {
			this.params = template.a;
			this.fire = fireEventWithParams;
		}
	}
}


function fireMethodCall ( event ) {
	var ractive, values, args;

	ractive = this.root;

	if ( typeof ractive[ this.method ] !== 'function' ) {
		throw new Error( 'Attempted to call a non-existent method ("' + this.method + '")' );
	}

	values = this.keypaths.map( function ( keypath ) {
		var value, len, i;

		if ( keypath === undefined ) {
			// not yet resolved
			return undefined;
		}

		// TODO the refinements stuff would be better handled at parse time
		if ( keypath.eventObject ) {
			value = event;

			if ( len = keypath.refinements.length ) {
				for ( i = 0; i < len; i += 1 ) {
					value = value[ keypath.refinements[i] ];
				}
			}
		} else {
			value = ractive.viewmodel.get( keypath );
		}

		return value;
	});

	ractive.event = event;

	args = this.fn.apply( null, values );
	ractive[ this.method ].apply( ractive, args );

	delete ractive.event;
}

function fireEventWithParams ( event ) {
	fireEvent( this.root, this.getAction(), { event: event, args: this.params } );
}

function fireEventWithDynamicParams ( event ) {
	var args = this.dynamicParams.getValue( getValueOptions );

	// need to strip [] from ends if a string!
	if ( typeof args === 'string' ) {
		args = args.substr( 1, args.length - 2 );
	}

	fireEvent( this.root, this.getAction(), { event: event, args: args } );
}
