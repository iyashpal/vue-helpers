import Axios from 'axios'
import isEqual from 'lodash.isequal'
import { reactive, watch } from 'vue'
import cloneDeep from 'lodash.clonedeep'

export default function useForm(...args) {
    const rememberKey = typeof args[0] === 'string' ? args[0] : null

    const data = (typeof args[0] === 'string' ? args[1] : args[0]) || {}

    let defaults = cloneDeep(data)

    let cancelToken = null

    let recentlySuccessfulTimeoutId = null

    let transform = data => data

    let form = reactive({
        ...data,
        isDirty: false,
        errors: {},
        errorMessage: null,
        hasErrors: false,
        processing: false,
        progress: null,
        wasSuccessful: false,
        recentlySuccessful: false,

        data() {
            return Object
                .keys(data)
                .reduce((carry, key) => {
                    carry[key] = this[key]
                    return carry
                }, {})
        },

        transform(callback) {
            transform = callback

            return this
        },

        reset(...fields) {
            let clonedDefaults = cloneDeep(defaults)
            if (fields.length === 0) {
                Object.assign(this, clonedDefaults)
            } else {
                Object.assign(
                    this,
                    Object
                        .keys(clonedDefaults)
                        .filter(key => fields.includes(key))
                        .reduce((carry, key) => {
                            carry[key] = clonedDefaults[key]
                            return carry
                        }, {}),
                )
            }

            return this
        },

        clearErrors(...fields) {
            this.errors = Object
                .keys(this.errors)
                .reduce((carry, field) => ({
                    ...carry,
                    ...(fields.length > 0 && !fields.includes(field) ? { [field]: this.errors[field] } : {}),
                }), {})

            this.hasErrors = Object.keys(this.errors).length > 0

            return this
        },

        submit(method, url, options = {}) {
            const data = transform(this.data())
            const _options = {
                onCancelToken: (token) => {
                    Axios.CancelToken
                    cancelToken = token

                    if (options.onCancelToken) {
                        return options.onCancelToken(token)
                    }
                },
                onBefore: visit => {
                    this.wasSuccessful = false
                    this.recentlySuccessful = false
                    clearTimeout(recentlySuccessfulTimeoutId)

                    if (options.onBefore) {
                        return options.onBefore(visit)
                    }
                },
                onStart: visit => {
                    this.processing = true

                    if (options.onStart) {
                        return options.onStart(visit)
                    }
                },
                onProgress: event => {
                    this.progress = event

                    if (options.onProgress) {
                        return options.onProgress(event)
                    }
                },

                onSuccess: response => {

                    this.processing = false

                    this.progress = null

                    this.clearErrors()

                    this.wasSuccessful = true

                    this.recentlySuccessful = true

                    recentlySuccessfulTimeoutId = setTimeout(() => this.recentlySuccessful = false, 2000)

                    const isSuccess = options.onSuccess ? options.onSuccess(response) : response;

                    defaults = cloneDeep(this.data())

                    this.isDirty = false

                    return Promise.resolve(isSuccess);
                },

                onError: ({ response, request, message }) => {
                    this.processing = false
                    this.progress = null
                    this.hasErrors = true

                    if (response) {
                        // The request was made and the server responded with a status code
                        // that falls out of the range of 2xx
                        let { data, status, headers } = response;

                        if (data.message) {
                            this.errorMessage = data.message;
                        }

                        if (data.errors && (typeof data.errors === 'object' || typeof data.errors === 'array')) {
                            for (let i in data.errors) {
                                switch (typeof data.errors[i]) {
                                    case 'object':
                                        this.errors[i] = Object.values(data.errors[i])[0];
                                        break;
                                    case 'array':
                                        this.errors[i] = data.errors[i][0];
                                        break;
                                    default:
                                        this.errors[i] = data.errors[i];
                                        break;
                                }
                            }
                        }

                    } else if (request) {
                        // The request was made but no response was received
                        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
                        // http.ClientRequest in node.js
                        this.errorMessage = "Something went wrong";
                    } else {
                        // Something happened in setting up the request that triggered an Error
                        this.errorMessage = error.message;
                    }

                    // if (options.onError) {
                    //     return options.onError(errors)
                    // }

                    return Promise.reject({ response, request, message })

                },

                onCancel: () => {
                    this.processing = false
                    this.progress = null

                    if (options.onCancel) {
                        return options.onCancel()
                    }
                },

                onFinish: response => {
                    this.processing = false
                    this.progress = null
                    cancelToken = null
                    return options.onFinish ? options.onFinish(response) : Promise.resolve(response);
                },
            }



            return Axios({
                method, url, data,

                cancelToken: new Axios.CancelToken((cancel) => cancelToken = cancel),

                transformRequest: [(data, headers) => {

                    this.wasSuccessful = false
                    this.processing = true;
                    this.recentlySuccessful = false
                    clearTimeout(recentlySuccessfulTimeoutId)

                    return data;
                }, ...Axios.defaults.transformRequest],

            }).then(_options.onSuccess).catch(_options.onError)
                .then(_options.onFinish);
        },
        get(url, options) {
            return this.submit('get', url, options)
        },
        post(url, options) {
            return this.submit('post', url, options)
        },
        put(url, options) {
            return this.submit('put', url, options)
        },
        patch(url, options) {
            return this.submit('patch', url, options)
        },
        delete(url, options) {
            return this.submit('delete', url, options)
        },
        cancel() {
            if (cancelToken) {
                cancelToken.cancel()
            }
        },

        __rememberable: rememberKey === null,

        __remember() {
            return { data: this.data(), errors: this.errors }
        },

    })

    watch(form, newValue => {
        form.isDirty = !isEqual(form.data(), defaults)
    }, { immediate: true, deep: true })

    return form
}
