
/**
 * provides various coding tools like Optional-s and Promise-s
 */
define([], () => (...ctorArgs) => {

    /**
     * similar to the built-in Promise, I guess,
     * but in slightly more convenient format
     */
    let promise = function(giveMemento)
    {
        let done = false;
        let result;
        let thens = [];
        giveMemento(r => {
            done = true;
            result = r;
            thens.forEach((cb) => cb(result));
        });
        let self = {
            set then(receive) {
                if (done) {
                    receive(result);
                } else {
                    thens.push(receive);
                }
            },
            map: (f) => promise(
                delayedReturn => self.then =
                (r) => delayedReturn(f(r))
            ),
        };
        return self;
    };

    /** @param responseType = 'arraybuffer' | 'json' | 'text' */
    let http = (url, responseType) => promise(done => {
        let oReq = new XMLHttpRequest();
        oReq.open("GET", url, true);
        if (responseType) {
            oReq.responseType = responseType;
        }
        oReq.onload = () => done(oReq.response);
        oReq.send(null);
    });

    return {
        promise: promise,
        http: http,
    };
});